from functools import lru_cache

from fastapi import APIRouter, Depends

from app.api.deps import get_agent, get_store
from app.schemas.forecast import TurbineId
from app.schemas.metrics import MetricsResponse, PowerCurveResponse
from app.services.export import overall_metrics

router = APIRouter(tags=["metrics"])


@router.get("/metrics", response_model=MetricsResponse)
def metrics(store=Depends(get_store)):
    return overall_metrics(store.latest_forecasts())


@lru_cache(maxsize=4)
def _curve(turbine: str):
    return get_agent().f.curve_data(turbine)


@router.get("/power-curve", response_model=PowerCurveResponse)
def power_curve(turbine: TurbineId = "STATION"):
    """История (прогнозный ветер 100 м с поправкой на плотность → факт мощности) и кривая."""
    return _curve(turbine)


@router.get("/quality")
def data_quality():
    """Сводка пропусков в факте (wind_actuals_gaps): по турбинам, по месяцам, самые длинные."""
    from app.services.quality import summary
    return summary()


@router.get("/analogs")
def analogs(issue_date: str = Depends(__import__("app.api.deps", fromlist=["issue_date_param"]).issue_date_param),
            turbine: TurbineId = "STATION"):
    """Похожие исторические ситуации (Analog Ensemble) и их фактическая выработка."""
    from app.services.analogs import find_analogs
    return find_analogs(get_agent().f, issue_date, turbine)
