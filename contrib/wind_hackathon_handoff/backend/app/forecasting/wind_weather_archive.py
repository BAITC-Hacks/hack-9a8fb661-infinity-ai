"""Point weather archives. Never substitute reanalysis or the live seamless API."""

from __future__ import annotations

import hashlib
import json
import logging
import math
from pathlib import Path

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from backend.app.forecasting.wind_hackathon import (
    interpolate_weather,
    local_time,
    prepare_weather,
    stamp,
)

logger = logging.getLogger(__name__)
OPEN_METEO_URL = "https://single-runs-api.open-meteo.com/v1/forecast"
VARIABLES = {
    "wind_speed_10m": "wind_speed_10m_ms",
    "wind_speed_100m": "wind_speed_100m_ms",
    "wind_direction_10m": "wind_direction_10m_deg",
    "wind_direction_100m": "wind_direction_100m_deg",
    "temperature_2m": "temperature_2m_c",
    "pressure_msl": "pressure_msl_hpa",
    "wind_gusts_10m": "wind_gusts_10m_ms",
    "precipitation": "precipitation_mm",
}


class ArchiveError(ValueError):
    pass


def http_session():
    session = requests.Session()
    session.mount(
        "https://",
        HTTPAdapter(
            max_retries=Retry(
                total=3,
                backoff_factor=1,
                status_forcelist=(429, 500, 502, 503, 504),
                allowed_methods=("GET", "HEAD"),
                respect_retry_after_header=True,
            )
        ),
    )
    return session


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, allow_nan=False).encode()).hexdigest()


def save_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    temporary.replace(path)


class OpenMeteoArchive:
    provider = "open-meteo"
    weather_model = "ecmwf_ifs"

    def __init__(self, cache_dir, *, lag_hours=8, allow_hindcast=False, session=None):
        if not 6 <= lag_hours <= 24:
            raise ValueError("Open-Meteo publication assumption must be 6..24 hours")
        self.cache_dir = Path(cache_dir)
        self.lag_hours = lag_hours
        self.allow_hindcast = allow_hindcast
        self.session = session or http_session()

    def candidates(self, origin, count=4):
        latest = (local_time(origin).tz_convert("UTC") - pd.Timedelta(hours=self.lag_hours)).floor("6h")
        return [latest - pd.Timedelta(hours=6 * i) for i in range(count)]

    def fetch(self, objects, issue, *, refresh=False):
        issue = local_time(issue).tz_convert("UTC")
        if issue != issue.floor("6h"):
            raise ArchiveError("ECMWF issue must be a 00/06/12/18 UTC cycle")
        if issue < pd.Timestamp("2024-03-14", tz="UTC"):
            raise ArchiveError("Open-Meteo single-run archive starts on 2024-03-14")
        historical = issue < pd.Timestamp("2026-05-12T06:00Z")
        if historical and not self.allow_hindcast:
            raise ArchiveError(
                "Open-Meteo documents early IFS data as 49R1 hindcasts. "
                "For a provisional experiment use --allow-hindcast and disclose this; "
                "for an as-issued February replay use --source noaa-gfs."
            )
        for obj in objects:
            if not (-90 <= float(obj["latitude"]) <= 90 and -180 <= float(obj["longitude"]) <= 180):
                raise ArchiveError("Invalid object coordinates")
        params = {
            "latitude": ",".join(str(o["latitude"]) for o in objects),
            "longitude": ",".join(str(o["longitude"]) for o in objects),
            "hourly": ",".join(VARIABLES),
            "models": self.weather_model,
            "run": issue.strftime("%Y-%m-%dT%H:%M"),
            "forecast_days": 5,
            "wind_speed_unit": "ms",
            "temperature_unit": "celsius",
            "precipitation_unit": "mm",
            "timezone": "GMT",
        }
        cache = self.cache_dir / "open-meteo" / (digest(params) + ".json")
        if cache.exists() and not refresh:
            saved = json.loads(cache.read_text(encoding="utf-8"))
            payload = saved["response"]
            if digest(payload) != saved["response_sha256"]:
                raise ArchiveError("Weather cache checksum mismatch")
        else:
            response = self.session.get(OPEN_METEO_URL, params=params, timeout=(10, 60))
            response.raise_for_status()
            payload = response.json()
            saved = {
                "url": response.url,
                "parameters": params,
                "response": payload,
                "response_sha256": digest(payload),
                "retrieved_at": stamp(pd.Timestamp.now(tz="UTC")),
            }
            save_json(cache, saved)
            save_json(
                self.cache_dir / "open-meteo" / "responses" / (saved["response_sha256"] + ".json"), saved
            )
        locations = payload if isinstance(payload, list) else [payload]
        if len(locations) != len(objects):
            raise ArchiveError("Weather response location count differs from object count")
        rows = []
        for location_index, (obj, location) in enumerate(zip(objects, locations, strict=True)):
            if location.get("location_id", 0) != location_index:
                raise ArchiveError("Unexpected Open-Meteo location ordering")
            hourly, units = location["hourly"], location["hourly_units"]
            if units.get("wind_speed_100m") != "m/s" or units.get("temperature_2m") != "°C":
                raise ArchiveError("Unexpected weather units")
            times = pd.to_datetime(hourly["time"], utc=True)
            if times.empty or times.duplicated().any() or not times.is_monotonic_increasing:
                raise ArchiveError("Invalid weather time axis")
            # Open-Meteo may start a non-midnight run at the beginning of its UTC day.
            if not any(t == issue for t in times):
                raise ArchiveError("Requested initialisation absent from response")
            for key in VARIABLES:
                if len(hourly.get(key, [])) != len(times):
                    raise ArchiveError(f"Incomplete variable {key}")
            for n, valid in enumerate(times):
                if valid < issue:
                    continue
                row = {
                    "object_id": int(obj["object_id"]),
                    "provider": self.provider,
                    "weather_model": self.weather_model,
                    "issued_at": stamp(issue),
                    "available_at": stamp(issue + pd.Timedelta(hours=self.lag_hours)),
                    "valid_at": stamp(valid),
                    "source_url": saved["url"],
                    "source_sha256": saved["response_sha256"],
                    "archive_kind": "hindcast_unverified" if historical else "single_run_archive",
                    "availability_basis": f"assumed_initialisation_plus_{self.lag_hours}h",
                    "requested_latitude": float(obj["latitude"]),
                    "requested_longitude": float(obj["longitude"]),
                    "grid_latitude": float(location["latitude"]),
                    "grid_longitude": float(location["longitude"]),
                }
                for key, column in VARIABLES.items():
                    value = hourly[key][n]
                    row[column] = float(value) if value is not None and math.isfinite(float(value)) else None
                rows.append(row)
        return rows


def fetch_for_origin(store, source, objects, origin, horizon_hours=48, *, refresh=False):
    """Observe sources, reject incomplete/future runs, fall back to an older issue."""
    origin = local_time(origin)
    failures = []
    targets = pd.date_range(origin, periods=horizon_hours * 6, freq="10min")
    for issue in source.candidates(origin):
        try:
            rows = source.fetch(objects, issue, refresh=refresh)
            weather = prepare_weather(rows)
            for obj in objects:
                run = weather[(weather.object_id == obj["object_id"]) & (weather.available_at <= origin)]
                interpolate_weather(run, targets)
        except (ArchiveError, ValueError, requests.RequestException) as exc:
            failures.append({"issue": stamp(issue), "reason": str(exc)})
            logger.warning("weather_issue_rejected issue=%s reason=%s", issue, exc)
            continue
        store.write_weather(rows)
        return {
            "issued_at": stamp(issue),
            "rows": len(rows),
            "rejected": failures,
            "archive_kind": sorted({r["archive_kind"] for r in rows}),
        }
    raise ArchiveError(f"No eligible complete weather run for {stamp(origin)}: {failures}")
