"""История ВЭС: 10-минутные CSV -> часовой ряд в UTC.

Контракт для таблиц дата-инженера: если есть data/processed/history_hourly.csv
с колонками HISTORY_COLUMNS, он используется вместо сборки из data/raw.
"""
import pandas as pd

from app.core import config

HISTORY_COLUMNS = ["time", "turbine", "wind_speed", "power", "temperature", "is_downtime"]
RAW_COLUMNS = ["id", "time", "wind_speed", "power", "temperature"]
PROCESSED_FILE = config.PROCESSED_DIR / "history_hourly.csv"


class DataError(ValueError):
    pass


def read_raw(path) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="utf-8-sig")
    if df.shape[1] != len(RAW_COLUMNS):
        raise DataError(f"{path}: ожидалось {len(RAW_COLUMNS)} колонок, получено {df.shape[1]}")
    df.columns = RAW_COLUMNS
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    for c in ("wind_speed", "power", "temperature"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["time"]).drop_duplicates("time").sort_values("time")
    return df.drop(columns="id")


def to_hourly(df: pd.DataFrame, utc_offset: int = config.SOURCE_UTC_OFFSET) -> pd.DataFrame:
    """Местное время -> UTC; час H = среднее по окну [H-30мин, H+30мин).

    Центрированное окно сопоставимо с мгновенными значениями метеомодели на час H.
    """
    x = df.copy()
    x["time"] = x["time"] - pd.Timedelta(hours=utc_offset) + pd.Timedelta(minutes=30)
    h = x.set_index("time")[["wind_speed", "power", "temperature"]].resample("h").mean()
    h = h.dropna(subset=["power"])
    h["power"] = h["power"].clip(0, 1)
    h["is_downtime"] = (h["power"] < 0.01) & (h["wind_speed"] > 5)
    h.index = h.index.tz_localize("UTC")
    return h.reset_index()


def read_actuals(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """wind_actuals (object_id, timestamp, avg_wind, avg_tmp, power_normalized) -> по турбинам."""
    ids = {t.object_id: t.id for t in config.TURBINES}
    df = df.rename(columns={"timestamp": "time", "avg_wind": "wind_speed", "avg_tmp": "temperature",
                            "power_normalized": "power"})
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    if df["time"].dt.tz is not None:     # из ClickHouse приходит с поясом Etc/GMT-5
        df["time"] = df["time"].dt.tz_localize(None)
    out = {}
    for oid, g in df.groupby("object_id"):
        if int(oid) in ids:
            g = g.dropna(subset=["time"]).drop_duplicates("time").sort_values("time")
            out[ids[int(oid)]] = g[["time", "wind_speed", "power", "temperature"]]
    return out


def _hourly_from(parts_raw: dict[str, pd.DataFrame]) -> pd.DataFrame:
    parts = []
    for tid, raw in parts_raw.items():
        h = to_hourly(raw)
        h["turbine"] = tid
        parts.append(h)
    return pd.concat(parts, ignore_index=True)[HISTORY_COLUMNS]


def build_history() -> pd.DataFrame:
    """Приоритет: таблица wind_actuals в ClickHouse -> data/raw/wind_actuals.csv -> CSV по турбинам."""
    try:
        from app import db
        store = db.get_store()
        if hasattr(store, "actuals"):
            raw = store.actuals()
            if raw is not None and len(raw):
                return _hourly_from(read_actuals(raw))
    except Exception as e:  # БД недоступна — работаем от файлов
        import logging
        logging.getLogger(__name__).warning("wind_actuals из БД недоступна: %s", e)
    actuals = config.RAW_DIR / config.ACTUALS_FILE
    if actuals.exists():
        return _hourly_from(read_actuals(pd.read_csv(actuals)))
    parts = []
    for t in config.TURBINES:
        path = config.RAW_DIR / t.raw_file
        if not path.exists():
            raise DataError(f"Нет файла {path}. См. README, раздел «Данные».")
        h = to_hourly(read_raw(path))
        h["turbine"] = t.id
        parts.append(h)
    return pd.concat(parts, ignore_index=True)[HISTORY_COLUMNS]


def load_history() -> pd.DataFrame:
    if PROCESSED_FILE.exists():
        df = pd.read_csv(PROCESSED_FILE)
        missing = set(HISTORY_COLUMNS) - set(df.columns)
        if missing:
            raise DataError(f"{PROCESSED_FILE}: нет колонок {sorted(missing)}")
        df["time"] = pd.to_datetime(df["time"], utc=True)
        df["is_downtime"] = df["is_downtime"].astype(bool)
        return df[HISTORY_COLUMNS]
    return build_history()


def station_series(history: pd.DataFrame) -> pd.DataFrame:
    """Станция = среднее нормализованной мощности по турбинам (шкала 0..1)."""
    g = history.groupby("time")
    out = g[["wind_speed", "power", "temperature"]].mean()
    out["is_downtime"] = g["is_downtime"].any()
    out["turbine"] = "STATION"
    return out.reset_index()[HISTORY_COLUMNS]
