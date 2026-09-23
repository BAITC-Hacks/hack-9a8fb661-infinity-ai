"""Качество данных: отчёт о пропусках wind_actuals_gaps (дата-инженер)."""
import pandas as pd

from app import db
from app.core import config

TURBINE_BY_OBJECT = {t.object_id: t.id for t in config.TURBINES}


def gaps_df() -> pd.DataFrame:
    """Пропуски во времени UTC. Источник: ClickHouse, иначе CSV из data/raw."""
    store = db.get_store()
    df = store.gaps() if hasattr(store, "gaps") else None
    if df is None or df.empty:
        path = config.RAW_DIR / config.GAPS_FILE
        if not path.exists():
            return pd.DataFrame(columns=["turbine", "first_missing", "last_missing", "missing_hours"])
        df = pd.read_csv(path)
    df = df.copy()
    if "missing_slots" not in df:
        df["missing_slots"] = (df["missing_hours"] * 6).round().astype(int)
    shift = pd.Timedelta(hours=config.SOURCE_UTC_OFFSET)
    for c in ("first_missing", "last_missing"):
        df[c] = (pd.to_datetime(df[c]) - shift).dt.tz_localize("UTC")
    df["turbine"] = df["object_id"].map(TURBINE_BY_OBJECT)
    return df.dropna(subset=["turbine"])


def gaps_before(issue_date, window_h=72) -> dict:
    """Пропуски факта в окне [выпуск - window_h, выпуск): число и самый длинный (ч)."""
    df = gaps_df()
    t1 = pd.Timestamp(issue_date, tz="UTC")
    t0 = t1 - pd.Timedelta(hours=window_h)
    hit = df[(df["last_missing"] >= t0) & (df["first_missing"] < t1)]
    return {"count": int(len(hit)),
            "max_hours": round(float(hit["missing_hours"].max()), 2) if len(hit) else 0.0,
            "turbines": sorted(hit["turbine"].unique().tolist())}


def summary() -> dict:
    df = gaps_df()
    if df.empty:
        return {"turbines": [], "monthly": []}
    per = df.groupby("turbine").agg(count=("missing_hours", "size"),
                                    hours=("missing_hours", "sum"),
                                    longest=("missing_hours", "max")).reset_index()
    df["month"] = df["first_missing"].dt.strftime("%Y-%m")
    monthly = df.pivot_table(index="month", columns="turbine", values="missing_hours",
                             aggfunc="sum", fill_value=0).reset_index()
    top = df.nlargest(5, "missing_hours")[["turbine", "first_missing", "missing_hours"]]
    return {
        "turbines": per.round(2).to_dict("records"),
        "monthly": monthly.round(2).to_dict("records"),
        "longest": [{"turbine": r.turbine, "start": r.first_missing.isoformat(),
                     "hours": round(float(r.missing_hours), 2)} for r in top.itertuples()],
        "total_hours": round(float(df["missing_hours"].sum()), 1),
    }
