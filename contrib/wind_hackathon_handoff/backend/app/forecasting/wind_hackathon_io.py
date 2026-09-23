"""Explicit ClickHouse I/O for the standalone hackathon workflow."""

from __future__ import annotations

import logging
from pathlib import Path
from uuid import uuid4

import joblib
import pandas as pd
import sklearn

from backend.app.forecasting.wind_hackathon import (
    MODEL_TYPE,
    complete_actual_points,
    data_digest,
    fit_models,
    local_time,
    power_rows,
    predict_object,
    prepare_weather,
    stamp,
    training_pairs,
)

logger = logging.getLogger(__name__)


class WindStore:
    def __init__(self, client):
        self.client = client

    def objects(self):
        rows = self.client.query_json_each_row(
            "SELECT object_id, name, latitude, longitude, rated_power_mw, "
            "tower_height_m, rotor_diameter_m FROM wind_objects FINAL ORDER BY object_id"
        )
        if not rows:
            raise ValueError("wind_objects is empty")
        return rows

    def actuals(self, start, cutoff):
        return self.client.query_json_each_row(
            """SELECT object_id, timestamp, avg_wind, avg_tmp, power_normalized
               FROM wind_actuals FINAL
               WHERE timestamp >= parseDateTime64BestEffort({start:String})
                 AND timestamp < parseDateTime64BestEffort({cutoff:String})
               ORDER BY object_id, timestamp""",
            parameters={"start": stamp(start), "cutoff": stamp(cutoff)},
        )

    def weather(self, start, end, provider, weather_model):
        return self.client.query_json_each_row(
            """SELECT * FROM wind_weather_forecasts FINAL
               WHERE valid_at >= parseDateTime64BestEffort({start:String})
                 AND valid_at <= parseDateTime64BestEffort({end:String})
                 AND provider = {provider:String} AND weather_model = {model:String}
               ORDER BY object_id, issued_at, valid_at""",
            parameters={
                "start": stamp(start),
                "end": stamp(end),
                "provider": provider,
                "model": weather_model,
            },
        )

    def write_forecast(self, rows):
        # Validate every object first; one insert publishes the complete batch.
        self.client.insert_json_each_row("wind_power_forecasts", rows)

    def write_weather(self, rows):
        self.client.insert_json_each_row("wind_weather_forecasts", rows)

    def forecast_count(self, run_id):
        rows = self.client.query_json_each_row(
            "SELECT count() AS rows FROM wind_power_forecasts FINAL WHERE run_id = {run:UUID}",
            parameters={"run": run_id},
        )
        return int(rows[0]["rows"])


def train(
    store: WindStore,
    *,
    start,
    cutoff,
    artifact: Path,
    provider: str,
    weather_model: str,
    publication_lag_hours: float | None,
    validation_days: int = 30,
):
    start, cutoff = local_time(start), local_time(cutoff)
    if start >= cutoff:
        raise ValueError("Training start must precede cutoff")
    if artifact.exists():
        raise ValueError("Artifact exists; use a new path to preserve model versions")
    objects = store.objects()
    actuals = complete_actual_points(store.actuals(start, cutoff))
    weather = prepare_weather(store.weather(start, cutoff, provider, weather_model), publication_lag_hours)
    pairs = training_pairs(actuals, weather, cutoff)
    models = fit_models(pairs, cutoff, validation_days)
    expected = {int(obj["object_id"]) for obj in objects}
    if set(models) != expected:
        raise ValueError(f"Models missing for objects: {expected - set(models)}")
    bundle = {
        "format_version": 1,
        "model_version": f"{MODEL_TYPE}-{uuid4().hex[:12]}",
        "model_type": MODEL_TYPE,
        "trained_until": stamp(cutoff),
        "training_start": stamp(start),
        "provider": provider,
        "weather_model": weather_model,
        "publication_lag_hours": publication_lag_hours,
        "training_data_sha256": data_digest(pairs),
        "sklearn_version": sklearn.__version__,
        "created_at": stamp(pd.Timestamp.now(tz="UTC")),
        "objects": objects,
        "archive_kinds": sorted(set(weather.get("archive_kind", pd.Series(["unspecified"])))),
        "models": models,
    }
    artifact.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, artifact)
    logger.info("wind_training_finished version=%s objects=%s", bundle["model_version"], sorted(models))
    return {
        "model_version": bundle["model_version"],
        "archive_kinds": bundle["archive_kinds"],
        "validation": {oid: model.validation for oid, model in models.items()},
    }


def load_bundle(path: Path):
    # joblib/pickle artifacts must only be loaded from trusted local training.
    bundle = joblib.load(path)
    if bundle.get("format_version") != 1 or bundle.get("model_type") != MODEL_TYPE:
        raise ValueError("Unsupported wind model artifact")
    if bundle.get("sklearn_version") != sklearn.__version__:
        raise ValueError("Use the same scikit-learn version as the training artifact")
    return bundle


def forecast(store: WindStore, bundle: dict, *, origin, horizon_hours=48, persist=True, run_id=None):
    origin = local_time(origin)
    if local_time(bundle["trained_until"]) > origin:
        raise ValueError("Model training cutoff is later than the simulated forecast origin")
    weather = prepare_weather(
        store.weather(
            origin, origin + pd.Timedelta(hours=horizon_hours), bundle["provider"], bundle["weather_model"]
        ),
        bundle["publication_lag_hours"],
    )
    run_id = str(run_id or uuid4())
    created_at = stamp(pd.Timestamp.now(tz="UTC"))
    all_rows = []
    issues = {}
    for obj in bundle["objects"]:
        oid = int(obj["object_id"])
        values, run, failures = predict_object(
            bundle["models"][oid],
            weather[weather.object_id == oid],
            origin,
            horizon_hours,
        )
        common = {
            "run_id": run_id,
            "object_id": oid,
            "forecast_origin": stamp(origin),
            "model_version": bundle["model_version"],
            "weather_provider": bundle["provider"],
            "weather_model": bundle["weather_model"],
            "weather_issued_at": stamp(run.issued_at),
            "weather_available_at": stamp(run.available_at),
            "weather_source_sha256": run.get("source_sha256", ""),
            "weather_archive_kind": run.get("archive_kind", "unspecified"),
            "actuals_cutoff": bundle["trained_until"],
            "created_at": created_at,
        }
        all_rows.extend(power_rows(values, float(obj["rated_power_mw"]), common))
        issues[oid] = stamp(run.issued_at)
        if failures:
            logger.warning("wind_older_weather_used object=%s rejected=%s", oid, failures)
    if persist:
        store.write_forecast(all_rows)
    logger.info(
        "wind_forecast_finished run_id=%s origin=%s rows=%s persisted=%s",
        run_id,
        origin,
        len(all_rows),
        persist,
    )
    return {
        "run_id": run_id,
        "forecast_origin": stamp(origin),
        "rows": len(all_rows),
        "persisted": persist,
        "weather_issues": issues,
        "data": all_rows,
    }
