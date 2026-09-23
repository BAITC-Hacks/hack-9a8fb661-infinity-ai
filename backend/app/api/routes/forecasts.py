import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.api.deps import agent_lock, get_agent, get_store, issue_date_param
from app.schemas.forecast import ForecastResponse, Run, TimelinePoint, TurbineId

router = APIRouter(tags=["forecasts"])
log = logging.getLogger(__name__)


def _clean(df):
    return df.astype(object).where(df.notna(), None)


@router.get("/issues", response_model=list[Run])
def issues(store=Depends(get_store)):
    return store.runs()


@router.get("/forecast", response_model=ForecastResponse)
def forecast(issue_date: str = Depends(issue_date_param), turbine: TurbineId = "STATION",
             store=Depends(get_store)):
    run = store.latest_run(issue_date)
    if not run:
        raise HTTPException(404, f"Нет прогноза на {issue_date}: POST /api/run")
    fc = _clean(store.forecasts(run["id"], turbine)).drop(columns="run_id")
    return {"run": run, "rows": fc.to_dict("records")}


@router.post("/run", response_model=Run)
def run(issue_date: str = Depends(issue_date_param), force: bool = False):
    if not agent_lock.acquire(timeout=120):
        raise HTTPException(409, "Агент занят другим расчётом")
    try:
        return get_agent().run_issue(issue_date, force=force)
    except Exception as e:
        log.exception("run failed")
        raise HTTPException(500, f"Ошибка агента: {e}")
    finally:
        agent_lock.release()


@router.get("/timeline", response_model=list[TimelinePoint])
def timeline(turbine: TurbineId = "STATION", max_lead: int = Query(24, ge=1, le=48),
             store=Depends(get_store)):
    """Склейка выпусков: для каждого — первые max_lead часов (обзор периода)."""
    fc = store.latest_forecasts(turbine)
    fc = _clean(fc[fc["lead_hours"].astype(int) <= max_lead])
    return fc[["issue_date", "target_time", "lead_hours", "p_hat", "actual"]].to_dict("records")


@router.get("/export/forecasts.csv", response_class=StreamingResponse)
def export_csv(store=Depends(get_store)):
    fc = store.latest_forecasts().drop(columns="run_id")
    return StreamingResponse(iter([fc.to_csv(index=False)]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=forecasts.csv"})
