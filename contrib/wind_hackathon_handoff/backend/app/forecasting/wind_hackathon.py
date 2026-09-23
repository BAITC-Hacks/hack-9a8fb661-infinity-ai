"""Nurly: weather-driven power forecast without February actuals.

Pure preparation/model functions; ClickHouse and archive orchestration live in
wind_hackathon_io. No connection or training takes place at import time.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import timedelta, timezone

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

TZ = timezone(timedelta(hours=5))
MODEL_TYPE = "nurly_weather_residual_v1"
WEATHER_COLUMNS = (
    "wind_speed_10m_ms",
    "wind_speed_80m_ms",
    "wind_speed_100m_ms",
    "wind_direction_10m_deg",
    "wind_direction_80m_deg",
    "wind_direction_100m_deg",
    "temperature_2m_c",
    "pressure_msl_hpa",
    "wind_gusts_10m_ms",
    "precipitation_mm",
)


def local_time(value) -> pd.Timestamp:
    ts = pd.Timestamp(value)
    if pd.isna(ts):
        raise ValueError("Missing timestamp")
    return ts.tz_localize(TZ) if ts.tzinfo is None else ts.tz_convert(TZ)


def stamp(value) -> str:
    return local_time(value).isoformat()


def prepare_actuals(rows: list[dict]) -> pd.DataFrame:
    """Complete hourly targets only. Missing telemetry is never synthesized."""
    if not rows:
        raise ValueError("No wind_actuals rows")
    frame = pd.DataFrame(rows)
    frame["timestamp"] = frame.timestamp.map(local_time)
    if frame.duplicated(["object_id", "timestamp"]).any():
        raise ValueError("Duplicate facts: read wind_actuals FINAL")
    if any(t.minute % 10 or t.second or t.microsecond for t in frame.timestamp):
        raise ValueError("Facts must lie on the 10-minute grid")
    for col in ("avg_wind", "avg_tmp", "power_normalized"):
        frame[col] = pd.to_numeric(frame[col], errors="coerce").replace([np.inf, -np.inf], np.nan)
    # Invalid labels become missing, not clipped targets. Wind does NOT gate power.
    frame.loc[~frame.power_normalized.between(0, 1), "power_normalized"] = np.nan
    frame["target_hour"] = frame.timestamp.dt.floor("h")
    hourly = frame.groupby(["object_id", "target_hour"], as_index=False).agg(
        power_normalized=("power_normalized", "mean"),
        valid_points=("power_normalized", "count"),
        avg_wind=("avg_wind", "mean"),
        avg_tmp=("avg_tmp", "mean"),
    )
    return hourly[hourly.valid_points == 6].reset_index(drop=True)


def prepare_weather(rows: list[dict], publication_lag_hours: float | None = None) -> pd.DataFrame:
    """Unknown publication time is rejected unless an explicit lag is supplied."""
    if not rows:
        raise ValueError("No archived weather forecasts")
    if publication_lag_hours is not None and publication_lag_hours < 0:
        raise ValueError("Publication lag cannot be negative")
    frame = pd.DataFrame(rows)
    for col in ("issued_at", "valid_at"):
        frame[col] = frame[col].map(local_time)
    if "available_at" not in frame:
        frame["available_at"] = None
    available = []
    for issue, value in zip(frame.issued_at, frame.available_at, strict=True):
        if value is None or pd.isna(value):
            if publication_lag_hours is None:
                raise ValueError("Unknown weather availability: supply a documented publication lag")
            value = issue + pd.Timedelta(hours=publication_lag_hours)
        value = local_time(value)
        if value < issue:
            raise ValueError("Weather publication precedes initialisation")
        available.append(value)
    frame["available_at"] = available
    keys = ["object_id", "provider", "weather_model", "issued_at", "valid_at"]
    if frame.duplicated(keys).any():
        raise ValueError("Duplicate weather: read wind_weather_forecasts FINAL")
    for col in WEATHER_COLUMNS:
        frame[col] = pd.to_numeric(frame.get(col, np.nan), errors="coerce")
    return frame.sort_values(keys).reset_index(drop=True)


def complete_actual_points(rows: list[dict]) -> pd.DataFrame:
    """Keep original ten-minute labels, but only inside complete valid hours."""
    hours = prepare_actuals(rows)
    points = pd.DataFrame(rows)
    points["target_time"] = points.timestamp.map(local_time)
    points["target_hour"] = points.target_time.dt.floor("h")
    points["power_normalized"] = pd.to_numeric(points.power_normalized, errors="coerce")
    return points.merge(
        hours[["object_id", "target_hour"]],
        on=["object_id", "target_hour"],
        how="inner",
        validate="many_to_one",
    )[["object_id", "target_time", "power_normalized"]]


def interpolate_weather(run: pd.DataFrame, index: pd.DatetimeIndex) -> pd.DataFrame:
    """Single issue only; require complete hourly weather and never extrapolate."""
    if run.empty or run.issued_at.nunique() != 1 or run.object_id.nunique() != 1:
        raise ValueError("Expected one object and one weather issue")
    source = run.set_index("valid_at").sort_index()
    required = pd.date_range(index.min().floor("h"), index.max().ceil("h"), freq="h")
    source = source.reindex(required)
    # Use 80 m if complete, otherwise 100 m explicitly as the nearest proxy.
    height = next((h for h in (80, 100) if source[f"wind_speed_{h}m_ms"].notna().all()), None)
    if height is None or source.temperature_2m_c.isna().any():
        raise ValueError("Incomplete weather coverage: need 80/100 m wind and temperature")
    if (source[f"wind_speed_{height}m_ms"] < 0).any():
        raise ValueError("Negative forecast wind")
    union = required.union(index)
    result = pd.DataFrame(index=index)
    for col in WEATHER_COLUMNS:
        values = source[col].replace([np.inf, -np.inf], np.nan)
        if "direction" in col:
            rad = np.deg2rad(values)
            sin = np.sin(rad).reindex(union).interpolate(method="time", limit_area="inside")
            cos = np.cos(rad).reindex(union).interpolate(method="time", limit_area="inside")
            result[col] = (np.rad2deg(np.arctan2(sin, cos)) % 360).reindex(index)
        else:
            result[col] = values.reindex(union).interpolate(method="time", limit_area="inside").reindex(index)
    result["wind_ms"] = result[f"wind_speed_{height}m_ms"]
    result["direction_deg"] = result[f"wind_direction_{height}m_deg"]
    result["weather_height_m"] = height
    result["lead_hours"] = (index - run.issued_at.iloc[0]).total_seconds() / 3600
    if not np.isfinite(result[["wind_ms", "temperature_2m_c"]].to_numpy()).all():
        raise ValueError("Nonfinite mandatory weather")
    return result


def physical_curve(wind) -> np.ndarray:
    """Passport-inspired baseline, NOT a hard constraint on the final model."""
    speed = np.asarray(wind, dtype=float)
    cf = np.clip((speed**3 - 3.0**3) / (10.3**3 - 3.0**3), 0, 1)
    return np.where(speed > 25, 0, cf)


def features(weather: pd.DataFrame) -> pd.DataFrame:
    result = weather[
        [
            "wind_ms",
            "temperature_2m_c",
            "pressure_msl_hpa",
            "wind_gusts_10m_ms",
            "precipitation_mm",
            "wind_speed_10m_ms",
            "weather_height_m",
            "lead_hours",
        ]
    ].copy()
    radians = np.deg2rad(weather.direction_deg)
    result["direction_sin"] = np.sin(radians)
    result["direction_cos"] = np.cos(radians)
    hour = weather.index.hour + weather.index.minute / 60
    result["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    result["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    result["year_sin"] = np.sin(2 * np.pi * weather.index.dayofyear / 365.25)
    result["year_cos"] = np.cos(2 * np.pi * weather.index.dayofyear / 365.25)
    return result.replace([np.inf, -np.inf], np.nan)


def training_pairs(actuals: pd.DataFrame, weather: pd.DataFrame, cutoff) -> pd.DataFrame:
    """Targets before cutoff; each issue's targets begin after its availability."""
    cutoff = local_time(cutoff)
    pieces = []
    for key, run in weather.groupby(["object_id", "provider", "weather_model", "issued_at"]):
        start = run.available_at.max().ceil("h")
        end = min(start + pd.Timedelta(hours=48), cutoff)
        if end <= start:
            continue
        index = pd.date_range(start, end, freq="10min", inclusive="left")
        try:
            prepared = interpolate_weather(run, index)
        except ValueError:
            continue
        part = features(prepared)
        part["physical_cf"] = physical_curve(prepared.wind_ms)
        part["object_id"], part["issued_at"] = key[0], key[3]
        part["origin"] = start
        part["target_time"] = index
        pieces.append(part.reset_index(drop=True))
    if not pieces:
        raise ValueError("No complete, eligible weather runs for training")
    return pd.concat(pieces, ignore_index=True).merge(
        actuals[["object_id", "target_time", "power_normalized"]],
        on=["object_id", "target_time"],
        how="inner",
        validate="many_to_one",
    )


@dataclass
class TurbineModel:
    estimator: HistGradientBoostingRegressor
    correction_weight: float
    columns: list[str]
    validation: dict

    def predict(self, weather: pd.DataFrame) -> np.ndarray:
        base = physical_curve(weather.wind_ms)
        correction = self.estimator.predict(features(weather)[self.columns])
        return np.clip(base + self.correction_weight * correction, 0, 1)


def fit_models(pairs: pd.DataFrame, cutoff, validation_days: int = 30) -> dict[int, TurbineModel]:
    if validation_days < 1:
        raise ValueError("validation_days must be positive")
    cutoff = local_time(cutoff)
    split = cutoff - pd.Timedelta(days=validation_days)
    excluded = {"object_id", "issued_at", "origin", "target_time", "power_normalized", "physical_cf"}
    columns = [c for c in pairs.columns if c not in excluded]
    models = {}
    for oid, data in pairs.groupby("object_id"):
        data = data[data.target_time < cutoff].sort_values("target_time")
        train = data[data.target_time < split]
        # Purge overlap: validation starts from origins at/after the split.
        valid = data[(data.origin >= split) & (data.target_time >= split)]
        if train.target_time.dt.floor("h").nunique() < 168 or valid.target_time.dt.floor("h").nunique() < 24:
            raise ValueError(f"Object {oid}: need 168 training and 24 validation hours")
        object_columns = [c for c in columns if train[c].notna().any()]

        def estimator():
            return HistGradientBoostingRegressor(
                learning_rate=0.055,
                max_iter=160,
                max_leaf_nodes=20,
                min_samples_leaf=18,
                l2_regularization=0.15,
                early_stopping=False,
                random_state=42,
            )

        model = estimator()
        # Each factual hour gets equal total weight despite overlapping forecasts.
        weights = 1 / train.groupby("target_time").target_time.transform("size")
        model.fit(train[object_columns], train.power_normalized - train.physical_cf, sample_weight=weights)
        correction = model.predict(valid[object_columns])
        target, base = valid.power_normalized.to_numpy(), valid.physical_cf.to_numpy()
        candidates = np.linspace(0, 1, 11)

        def hourly_scores(prediction, validation=valid, actual=target):
            evaluated = pd.DataFrame(
                {
                    "origin": validation.origin,
                    "hour": validation.target_time.dt.floor("h"),
                    "target": actual,
                    "prediction": prediction,
                }
            )
            grouped = evaluated.groupby(["origin", "hour"]).agg(
                target=("target", "mean"), prediction=("prediction", "mean"), points=("target", "count")
            )
            return grouped[grouped.points == 6]

        scores = []
        for w in candidates:
            scored = hourly_scores(np.clip(base + w * correction, 0, 1))
            scores.append(float(np.mean(np.abs(scored.target - scored.prediction))))
        weight = float(candidates[int(np.argmin(scores))])
        predicted = np.clip(base + weight * correction, 0, 1)
        hourly = hourly_scores(predicted).reset_index()
        error = hourly.target - hourly.prediction
        metrics = {
            "mae_cf": float(np.mean(np.abs(error))),
            "rmse_cf": float(np.sqrt(np.mean(error**2))),
            "physical_mae_cf": float(scores[0]),
            "validation_rows": len(valid),
            "training_rows": len(train),
            "validation_hourly_rows": len(hourly),
            "validation_start": stamp(split),
            "validation_end": stamp(cutoff),
        }
        lead = (hourly.hour - hourly.origin).dt.total_seconds() / 3600
        for label, mask in (("first_24h", lead < 24), ("next_24h", lead >= 24)):
            metrics[label + "_mae_cf"] = float(np.mean(np.abs(error[mask]))) if mask.any() else None
        final = estimator()
        weights = 1 / data.groupby("target_time").target_time.transform("size")
        final.fit(data[object_columns], data.power_normalized - data.physical_cf, sample_weight=weights)
        models[int(oid)] = TurbineModel(final, weight, object_columns, metrics)
    if not models:
        raise ValueError("No training pairs")
    return models


def predict_object(model: TurbineModel, weather: pd.DataFrame, origin, horizon_hours: int = 48):
    origin = local_time(origin)
    if horizon_hours not in (24, 48) or origin != origin.floor("h"):
        raise ValueError("Use a whole-hour origin and a 24 or 48 hour horizon")
    index = pd.date_range(origin, periods=horizon_hours * 6, freq="10min")
    eligible = weather[(weather.issued_at <= origin) & (weather.available_at <= origin)]
    failures = []
    # A complete older issue can replace an incomplete newer one, never a future issue.
    for issue in sorted(eligible.issued_at.unique(), reverse=True):
        run = eligible[eligible.issued_at == issue]
        try:
            prepared = interpolate_weather(run, index)
        except ValueError as exc:
            failures.append(str(exc))
            continue
        values = model.predict(prepared)
        if not np.isfinite(values).all():
            raise ValueError("Nonfinite power forecast")
        return pd.Series(values, index=index, name="power_normalized"), run.iloc[0], failures
    raise ValueError(f"No complete weather issue available at {origin}: {failures}")


def power_rows(values: pd.Series, rated_power_mw: float, common: dict) -> list[dict]:
    if not np.isfinite(rated_power_mw) or rated_power_mw <= 0:
        raise ValueError("Invalid rated power")
    rows = []
    for ts, cf in values.items():
        rows.append(
            {
                **common,
                "timestamp": stamp(ts),
                "period_type": "10min",
                "power_normalized": float(cf),
                "power_mw": float(cf * rated_power_mw),
                "energy_mwh": float(cf * rated_power_mw / 6),
            }
        )
    for hour, group in values.groupby(values.index.floor("h")):
        if len(group) != 6 or group.isna().any():
            raise ValueError("Incomplete forecast hour")
        cf = float(group.mean())
        rows.append(
            {
                **common,
                "timestamp": stamp(hour),
                "period_type": "hour",
                "power_normalized": cf,
                "power_mw": cf * rated_power_mw,
                "energy_mwh": float(group.sum() * rated_power_mw / 6),
            }
        )
    return rows


def data_digest(frame: pd.DataFrame) -> str:
    digest = hashlib.sha256(pd.util.hash_pandas_object(frame, index=False).values.tobytes())
    digest.update(json.dumps(list(frame.columns)).encode())
    return digest.hexdigest()
