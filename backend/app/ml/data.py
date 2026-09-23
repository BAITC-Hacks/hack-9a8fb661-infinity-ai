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
    Час допустим только при шести уникальных валидных точках на 10-минутной сетке.
    """
    x = df.copy()
    x["time"] = pd.to_datetime(x["time"], errors="coerce")
    cols = ["wind_speed", "power", "temperature"]
    x[cols] = x[cols].apply(pd.to_numeric, errors="coerce")
    x = x.dropna(subset=["time"]).drop_duplicates("time", keep=False)
    x = x[x["time"] == x["time"].dt.floor("10min")]
    valid = (x[cols].notna().all(axis=1)
             & ~x[cols].isin([float("inf"), float("-inf")]).any(axis=1)
             & x["power"].between(0, 1) & x["wind_speed"].ge(0))
    x = x[valid]
    x["time"] = x["time"] - pd.Timedelta(hours=utc_offset) + pd.Timedelta(minutes=30)
    grouped = x.set_index("time")[cols].resample("h")
    h = grouped.mean()
    h = h[grouped.size() == 6]
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
    """Сумма МВт / номинал станции; только часы с полным фактом всех турбин."""
    rated = {t.id: t.rated_power_mw for t in config.TURBINES}
    x = history[history["turbine"].isin(rated)].copy()
    x = x.drop_duplicates(["time", "turbine"], keep=False)
    x = x[x["power"].between(0, 1)]
    complete = x.groupby("time")["turbine"].transform("nunique") == len(rated)
    x = x[complete]
    x["power_mw"] = x["power"] * x["turbine"].map(rated)
    g = x.groupby("time")
    out = g[["wind_speed", "power", "temperature"]].mean()
    out["power"] = g["power_mw"].sum() / sum(rated.values())
    out["is_downtime"] = g["is_downtime"].any()
    out["turbine"] = "STATION"
    return out.reset_index()[HISTORY_COLUMNS]
