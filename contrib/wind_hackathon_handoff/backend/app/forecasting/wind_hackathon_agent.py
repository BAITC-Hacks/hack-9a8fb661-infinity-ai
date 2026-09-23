"""Autonomous, deterministic tool controller with durable decisions and recovery.

No LLM is needed to select a timestamp, reject leakage, or validate conservation
of energy. This is a rule-based agent; it does not pretend to be an LLM agent.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

import numpy as np
import pandas as pd
import requests

from backend.app.forecasting.wind_hackathon import (
    WEATHER_COLUMNS,
    local_time,
    prepare_actuals,
    prepare_weather,
    stamp,
)
from backend.app.forecasting.wind_hackathon_io import forecast
from backend.app.forecasting.wind_weather_archive import digest, fetch_for_origin, save_json

logger = logging.getLogger(__name__)


def analyze(rows, objects, origin, horizon, previous=()):
    origin = local_time(origin)
    frame = pd.DataFrame(rows)
    if frame.empty or frame.duplicated(["object_id", "period_type", "timestamp"]).any():
        raise ValueError("Empty/duplicate forecast")
    if set(frame.object_id) != {int(o["object_id"]) for o in objects}:
        raise ValueError("Forecast object set mismatch")
    frame["timestamp"] = frame.timestamp.map(local_time)
    if not np.isfinite(frame[["power_normalized", "power_mw", "energy_mwh"]].to_numpy()).all():
        raise ValueError("Nonfinite forecast")
    if not frame.power_normalized.between(0, 1).all():
        raise ValueError("Forecast power outside 0..1")
    report = {"status": "passed", "objects": {}, "warnings": []}
    for obj in objects:
        oid = int(obj["object_id"])
        points = (
            frame[(frame.object_id == oid) & (frame.period_type == "10min")]
            .set_index("timestamp")
            .sort_index()
        )
        hours = (
            frame[(frame.object_id == oid) & (frame.period_type == "hour")]
            .set_index("timestamp")
            .sort_index()
        )
        for data, periods, freq in ((points, horizon * 6, "10min"), (hours, horizon, "h")):
            if list(data.index) != list(pd.date_range(origin, periods=periods, freq=freq)):
                raise ValueError("Forecast does not cover requested grid")
            if not np.allclose(data.power_mw, data.power_normalized * float(obj["rated_power_mw"])):
                raise ValueError("MW/normalized power mismatch")
        if len(frame[frame.object_id == oid]) != len(points) + len(hours):
            raise ValueError("Unknown forecast granularity")
        if not np.allclose(points.energy_mwh, points.power_mw / 6):
            raise ValueError("Ten-minute energy mismatch")
        if not np.allclose(hours.power_mw, points.power_mw.resample("h").mean()):
            raise ValueError("Hourly mean power mismatch")
        if not np.allclose(hours.energy_mwh, points.energy_mwh.resample("h").sum()):
            raise ValueError("Hourly energy mismatch")
        report["objects"][oid] = {
            "energy_mwh": float(hours.energy_mwh.sum()),
            "min_cf": float(hours.power_normalized.min()),
            "max_cf": float(hours.power_normalized.max()),
        }
        if hours.power_normalized.std() < 1e-8:
            report["warnings"].append(f"object {oid}: constant forecast; check weather/operating conditions")
    if previous:
        prior = pd.DataFrame(previous)
        prior["timestamp"] = prior.timestamp.map(local_time)
        combined = frame[frame.period_type == "hour"].merge(
            prior[prior.period_type == "hour"], on=["object_id", "timestamp"], suffixes=("", "_previous")
        )
        if not combined.empty:
            change = (combined.power_normalized - combined.power_normalized_previous).abs()
            report["overlap_hours"] = len(combined)
            report["mean_change_cf"] = float(change.mean())
            report["max_change_cf"] = float(change.max())
            if change.max() > 0.3:
                report["warnings"].append("Large revision (>0.3 CF); retained as a weather-driven change")
    return report


def evaluate(rows, actual_rows, start, end):
    """Targets in [start,end), scored separately by origin and horizon band."""
    start, end = local_time(start), local_time(end)
    if not rows:
        raise ValueError("No predictions for evaluation")
    prediction = pd.DataFrame(rows)
    prediction = prediction[prediction.period_type == "hour"].copy()
    prediction["timestamp"] = prediction.timestamp.map(local_time)
    prediction["forecast_origin"] = prediction.forecast_origin.map(local_time)
    prediction = prediction[(prediction.timestamp >= start) & (prediction.timestamp < end)]
    if prediction.duplicated(["object_id", "forecast_origin", "timestamp"]).any():
        raise ValueError("Evaluation must select one revision per origin, not sum duplicate runs")
    if not actual_rows:
        return {"status": "awaiting_actuals", "predicted_hours": len(prediction), "matched_hours": 0}
    actuals = prepare_actuals(actual_rows).rename(
        columns={"target_hour": "timestamp", "power_normalized": "actual_cf"}
    )
    joined = prediction.merge(actuals[["object_id", "timestamp", "actual_cf"]], on=["object_id", "timestamp"])
    if joined.empty:
        return {"status": "awaiting_actuals", "predicted_hours": len(prediction), "matched_hours": 0}
    joined["lead"] = (joined.timestamp - joined.forecast_origin).dt.total_seconds() / 3600
    metrics = {}
    for oid, data in joined.groupby("object_id"):
        metrics[int(oid)] = {}
        for band, part in (
            ("all", data),
            ("first_24h", data[data.lead < 24]),
            ("next_24h", data[data.lead >= 24]),
        ):
            error = part.power_normalized - part.actual_cf
            metrics[int(oid)][band] = {
                "hours": len(part),
                "mae_cf": float(error.abs().mean()) if len(part) else None,
                "rmse_cf": float(np.sqrt((error**2).mean())) if len(part) else None,
                "bias_cf": float(error.mean()) if len(part) else None,
            }
    return {
        "status": "scored",
        "predicted_hours": len(prediction),
        "matched_hours": len(joined),
        "metrics": metrics,
    }


class WindAgent:
    def __init__(self, store, bundle, source, output_dir):
        self.store, self.bundle, self.source = store, bundle, source
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        if source and (source.provider, source.weather_model) != (
            bundle["provider"],
            bundle["weather_model"],
        ):
            raise ValueError("Weather source differs from the trained model; retrain for that source")
        if (
            source
            and not getattr(source, "allow_hindcast", False)
            and "hindcast_unverified" in bundle.get("archive_kinds", [])
        ):
            raise ValueError(
                "Model trained on unverified hindcasts; use explicit provisional mode or retrain"
            )

    def event(self, decision, **details):
        record = {"recorded_at": stamp(pd.Timestamp.now(tz="UTC")), "decision": decision, **details}
        with (self.output_dir / "decisions.jsonl").open("a", encoding="utf-8") as output:
            output.write(json.dumps(record, ensure_ascii=False, allow_nan=False) + "\n")
        logger.info("wind_agent %s", json.dumps(record, ensure_ascii=False))

    def run(self, origin, horizon=48, *, persist=True, refresh=False):
        origin = local_time(origin)
        if local_time(self.bundle["trained_until"]) > origin:
            raise ValueError("Model cutoff is after virtual origin")
        self.event("observe", origin=stamp(origin), horizon=horizon)
        objects = self.store.objects()
        for obj in objects:
            trained = next((o for o in self.bundle["objects"] if o["object_id"] == obj["object_id"]), None)
            if not trained or any(
                obj.get(k) != trained.get(k) for k in ("latitude", "longitude", "rated_power_mw")
            ):
                raise ValueError("Object coordinates/capacity changed: retrain and version the model")
        if {o["object_id"] for o in objects} != {o["object_id"] for o in self.bundle["objects"]}:
            raise ValueError("Object set changed: retrain")
        if self.source:
            try:
                fetched = fetch_for_origin(self.store, self.source, objects, origin, horizon, refresh=refresh)
                self.event("weather_ready", **fetched)
            except (ValueError, requests.RequestException) as exc:
                # A temporary upstream outage can use an already persisted eligible issue.
                self.event("try_saved_weather", reason=str(exc))
        weather = prepare_weather(
            self.store.weather(
                origin,
                origin + pd.Timedelta(hours=horizon),
                self.bundle["provider"],
                self.bundle["weather_model"],
            ),
            self.bundle["publication_lag_hours"],
        )
        weather = weather[(weather.issued_at <= origin) & (weather.available_at <= origin)]
        kinds = set(weather.get("archive_kind", pd.Series(["unspecified"])))
        if (
            self.source
            and not getattr(self.source, "allow_hindcast", False)
            and "hindcast_unverified" in kinds
        ):
            raise ValueError("Saved hindcasts cannot bypass the archive policy")
        fields = ["object_id", "issued_at", "available_at", "valid_at", *WEATHER_COLUMNS]
        fields += [
            c
            for c in (
                "archive_kind",
                "availability_basis",
                "requested_latitude",
                "requested_longitude",
                "grid_latitude",
                "grid_longitude",
            )
            if c in weather
        ]
        fingerprint = hashlib.sha256(
            weather[fields].to_json(date_format="iso", orient="records").encode()
        ).hexdigest()
        identity = {
            "origin": stamp(origin),
            "horizon": horizon,
            "model": self.bundle["model_version"],
            "weather": fingerprint,
            "objects": objects,
        }
        key = digest(identity)
        run_id = str(uuid5(NAMESPACE_URL, "wind:" + key))
        path = self.output_dir / "runs" / (run_id + ".json")
        if path.exists():
            saved = json.loads(path.read_text(encoding="utf-8"))
            if not persist or saved["persisted"]:
                if (
                    persist
                    and hasattr(self.store, "forecast_count")
                    and self.store.forecast_count(run_id) != saved["rows"]
                ):
                    self.store.write_forecast(saved["data"])
                    self.event("restore_saved_forecast", run_id=run_id, rows=saved["rows"])
                self.event("unchanged_skip", run_id=run_id, origin=stamp(origin))
                return {**saved, "status": "unchanged"}
        self.event("predict", run_id=run_id, origin=stamp(origin))

        # Snapshot avoids a time-of-check/time-of-use race with concurrent weather ingestion.
        class Snapshot:
            def weather(snapshot, *args):
                return weather.to_dict("records")

        result = forecast(
            Snapshot(), self.bundle, origin=origin, horizon_hours=horizon, persist=False, run_id=run_id
        )
        latest = self.output_dir / "latest.json"
        previous = json.loads(latest.read_text(encoding="utf-8"))["data"] if latest.exists() else []
        analysis = analyze(result["data"], objects, origin, horizon, previous)
        self.event("quality_passed", run_id=run_id, analysis=analysis)
        for row in result["data"]:
            row["input_sha256"] = key
        if persist:
            self.store.write_forecast(result["data"])
        result.update(
            {
                "persisted": persist,
                "status": "published" if persist else "dry_run",
                "input_sha256": key,
                "analysis": analysis,
                "archive_kinds": sorted(set(weather.get("archive_kind", pd.Series(["unspecified"])))),
            }
        )
        save_json(path, result)
        save_json(latest, result)
        self.event(result["status"], run_id=run_id, rows=result["rows"])
        return result
