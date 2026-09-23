from fastapi import APIRouter, Depends

from app import db
from app.api.deps import get_store
from app.core import config
from app.schemas.agent import Health, LlmUsage
from app.services import llm

router = APIRouter(tags=["system"])


@router.get("/health", response_model=Health)
def health():
    return Health(status="ok", storage=db.backend_name(), llm=llm.provider(),
                  weather_offline=config.WEATHER_OFFLINE)


@router.get("/usage", response_model=LlmUsage)
def usage(store=Depends(get_store)):
    return store.llm_usage()


@router.get("/objects")
def objects(store=Depends(get_store)):
    """Справочник объектов ВЭС (wind_objects)."""
    return store.objects()


@router.get("/data")
def data_summary(store=Depends(get_store)):
    """Сверка данных дата-инженера: 10-минутные строки wind_actuals, пропуски wind_actuals_gaps,
    часы после усреднения и часы, попавшие в обучение (есть архив прогноза погоды, нет простоя)."""
    import pandas as pd

    from app.core import config
    from app.ml.data import load_history, read_actuals
    from app.services.agent import ForecastAgent  # noqa: F401  (агент уже держит архив погоды)
    from app.api.deps import get_agent
    from app.services.quality import gaps_df

    raw = store.actuals() if hasattr(store, "actuals") else None
    if raw is None or not len(raw):
        raw = pd.read_csv(config.RAW_DIR / config.ACTUALS_FILE)
    per = read_actuals(raw)
    hist = load_history()
    gaps = gaps_df()
    f = get_agent().f
    until = pd.Timestamp(config.HISTORY_END, tz="UTC") + pd.Timedelta(hours=1)
    out = []
    for t in config.TURBINES:
        r = per.get(t.id)
        n = int(len(r)) if r is not None else 0
        first, last = (r["time"].min(), r["time"].max()) if n else (None, None)
        expected = int((last - first) / pd.Timedelta(minutes=10)) + 1 if n else 0
        g = gaps[gaps["turbine"] == t.id]
        h = hist[hist["turbine"] == t.id]
        train = f.training_frame(t.id, until)
        out.append({
            "object_id": t.object_id, "name": t.name,
            "rows_10min": n, "expected_10min": expected, "missing_10min": expected - n,
            "gaps": int(len(g)), "gap_slots": int(g["missing_slots"].sum()) if "missing_slots" in g else None,
            "gap_hours": round(float(g["missing_hours"].sum()), 1),
            "from": first.strftime("%Y-%m-%d %H:%M") if n else None, "to": last.strftime("%Y-%m-%d %H:%M") if n else None,
            "hours": int(len(h)), "downtime_hours": int(h["is_downtime"].sum()),
            # каждый час входит в обучение дважды: с прогнозом погоды за 1 и за 2 суток
            "train_hours": int(train["time"].nunique()), "train_rows": int(len(train)),
            "train_from": train["time"].min().strftime("%Y-%m-%d") if len(train) else None,
        })
    return {"storage": db.backend_name(), "tz_source": "Etc/GMT-5 (UTC+5)", "objects": out}
