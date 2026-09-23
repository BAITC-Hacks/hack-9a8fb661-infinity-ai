"""Архивные прогнозы погоды Open-Meteo (Previous Model Runs API).

Берём только переменные *_previous_day1 / *_previous_day2: значение на час T из прогона,
сделанного за 1 / 2 суток до T. Базовые переменные (последний прогон ≈ факт) не
запрашиваются вовсе — так утечка будущего исключена на уровне источника.
Каждый месячный ответ кешируется в data/cache/ — повторный запуск идёт без сети.
"""
import json
import logging

import pandas as pd
import requests

from app.core import config

log = logging.getLogger(__name__)

API_URL = "https://previous-runs-api.open-meteo.com/v1/forecast"
VARIABLES = ["wind_speed_100m", "wind_direction_100m", "wind_gusts_10m",
             "temperature_2m", "surface_pressure"]
LEAD_DAYS = (1, 2)
TIMEOUT_S = 30


class WeatherError(RuntimeError):
    pass


def _cache_path(lat, lon, start, end):
    return config.CACHE_DIR / f"prevruns_{lat:.4f}_{lon:.4f}_{start}_{end}.json"


def _fetch_chunk(lat, lon, start, end, offline) -> dict:
    path = _cache_path(lat, lon, start, end)
    if path.exists():
        return json.loads(path.read_text())
    if offline:
        raise WeatherError(f"Нет кеша {path.name}, а WEATHER_OFFLINE=true")
    hourly = [f"{v}_previous_day{d}" for d in LEAD_DAYS for v in VARIABLES]
    params = dict(latitude=lat, longitude=lon, hourly=",".join(hourly), start_date=start,
                  end_date=end, wind_speed_unit="ms", timezone="UTC")
    last_err = None
    for attempt in range(3):
        try:
            r = requests.get(API_URL, params=params, timeout=TIMEOUT_S)
            r.raise_for_status()
            data = r.json()
            if "hourly" not in data:
                raise WeatherError(f"Неожиданный ответ Open-Meteo: {str(data)[:200]}")
            config.CACHE_DIR.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data))
            log.info("weather fetched %s..%s", start, end)
            return data
        except (requests.RequestException, ValueError) as e:
            last_err = e
            log.warning("weather attempt %d failed: %s", attempt + 1, e)
    raise WeatherError(f"Open-Meteo недоступен ({start}..{end}): {last_err}")


def _month_chunks(start: pd.Timestamp, end: pd.Timestamp):
    cur = start.normalize().replace(day=1)
    while cur <= end:
        nxt = cur + pd.offsets.MonthBegin(1)
        yield cur.strftime("%Y-%m-%d"), (nxt - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
        cur = nxt


def load_weather(start, end, lat=config.SITE_LAT, lon=config.SITE_LON,
                 offline=None) -> pd.DataFrame:
    """Длинная таблица: time (UTC), lead_day (1|2), переменные VARIABLES."""
    offline = config.WEATHER_OFFLINE if offline is None else offline
    start, end = pd.Timestamp(start), pd.Timestamp(end)
    frames = []
    for s, e in _month_chunks(start, end):
        h = pd.DataFrame(_fetch_chunk(lat, lon, s, e, offline)["hourly"])
        h["time"] = pd.to_datetime(h["time"]).dt.tz_localize("UTC")
        for c in h.columns.drop("time"):
            h[c] = pd.to_numeric(h[c], errors="coerce")
        for d in LEAD_DAYS:
            part = h[["time"] + [f"{v}_previous_day{d}" for v in VARIABLES]].copy()
            part.columns = ["time"] + VARIABLES
            part["lead_day"] = d
            frames.append(part)
    df = pd.concat(frames, ignore_index=True)
    lo, hi = start.tz_localize("UTC") if start.tzinfo is None else start, \
        (end.tz_localize("UTC") if end.tzinfo is None else end) + pd.Timedelta(hours=23)
    df = df[(df["time"] >= lo) & (df["time"] <= hi)]
    return df.dropna(subset=["wind_speed_100m"]).reset_index(drop=True)


def forecast_for_issue(issue_date, horizon_h=config.HORIZON_H, offline=None) -> pd.DataFrame:
    """Погода, известная на момент issue_date 00:00 UTC, на часы +1..+horizon.

    Час +h (h<=24) берётся из прогона за 1 сутки, h>24 — за 2 суток. В обоих
    случаях прогон выпущен не позже момента выпуска прогноза.
    """
    issue = pd.Timestamp(issue_date).tz_localize("UTC")
    targets = pd.date_range(issue + pd.Timedelta(hours=1), periods=horizon_h, freq="h")
    w = load_weather(targets[0].normalize().tz_localize(None),
                     targets[-1].normalize().tz_localize(None), offline=offline)
    lead_h = ((targets - issue) / pd.Timedelta(hours=1)).astype(int)
    need = pd.DataFrame({"time": targets, "lead_hours": lead_h,
                         "lead_day": [1 if h <= 24 else 2 for h in lead_h]})
    out = need.merge(w, on=["time", "lead_day"], how="left")
    out["issue_time"] = issue
    out["run_time_max"] = out["time"] - pd.to_timedelta(out["lead_day"] * 24, unit="h")
    return out
