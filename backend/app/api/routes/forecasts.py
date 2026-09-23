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


@router.get("/weather")
def weather(issue_date: str = Depends(issue_date_param)):
    """Архивный прогноз погоды, известный на момент выпуска (для слоёв на графике)."""
    from app.ml.weather import forecast_for_issue
    w = forecast_for_issue(issue_date)
    cols = ["time", "lead_hours", "wind_speed_100m", "wind_direction_100m", "wind_gusts_10m",
            "temperature_2m", "surface_pressure"]
    w = w[cols].copy()
    w["time"] = w["time"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return _clean(w).to_dict("records")


@router.get("/export/forecasts.csv", response_class=StreamingResponse)
def export_csv(store=Depends(get_store)):
    fc = store.latest_forecasts().drop(columns="run_id")
    return StreamingResponse(iter([fc.to_csv(index=False)]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=forecasts.csv"})


@router.get("/passport")
def passport(issue_date: str = Depends(issue_date_param), store=Depends(get_store)):
    """«Паспорт» выпуска: что было доступно на момент прогноза, версия модели, контрольные суммы,
    изменение относительно предыдущего выпуска (машина времени)."""
    import hashlib

    import pandas as pd

    from app.core import config
    from app.ml.weather import forecast_for_issue

    run = store.latest_run(issue_date)
    if not run:
        raise HTTPException(404, f"Нет прогноза на {issue_date}")
    issue = pd.Timestamp(issue_date, tz="UTC")
    w = forecast_for_issue(issue_date)
    hist_end = min(get_agent().f.history["time"].max(), issue - pd.Timedelta(hours=1))
    runs = {int(d): {"lead_day": int(d), "hours": f"+{g['lead_hours'].min()}…+{g['lead_hours'].max()}",
                     "published_between": f"{g['run_time_max'].min():%Y-%m-%dT%H:%MZ} … {g['run_time_max'].max():%Y-%m-%dT%H:%MZ}"}
            for d, g in w.groupby("lead_day")}
    sig = w[["wind_speed_100m", "temperature_2m"]].round(2).assign(time=w["time"].astype(str))
    w_hash = hashlib.sha256(sig.to_csv(index=False).encode()).hexdigest()[:12]
    cur = store.forecasts(run["id"], "STATION")
    prev_run = store.previous_run(issue_date)
    diff = None
    if prev_run:
        prev = store.forecasts(prev_run["id"], "STATION")
        j = cur.merge(prev, on="target_time", suffixes=("", "_prev"))
        if len(j):
            diff = {"prev_issue": prev_run["issue_date"], "overlap_hours": int(len(j)),
                    "mean_abs_dp": round(float((j["p_hat"].astype(float) - j["p_hat_prev"].astype(float)).abs().mean()), 4),
                    "mean_abs_dwind": round(float((j["v_eq"].astype(float) - j["v_eq_prev"].astype(float)).abs().mean()), 2),
                    "prev_rows": prev[["target_time", "p_hat"]].astype({"p_hat": float}).to_dict("records")}
    return {
        "issue_date": issue_date, "issue_time_utc": issue.strftime("%Y-%m-%dT%H:%MZ"),
        "issue_time_local": (issue + pd.Timedelta(hours=config.SOURCE_UTC_OFFSET)).strftime("%Y-%m-%d %H:%M"),
        "history_available_until": hist_end.strftime("%Y-%m-%dT%H:%MZ"),
        "weather": {"source": "Open-Meteo Previous Model Runs API", "variables": "*_previous_day1/2 (100 m wind, gusts, T, p)",
                    "runs": list(runs.values()), "checksum": w_hash, "all_runs_before_issue": bool((w["run_time_max"] <= issue).all())},
        "model": {"version": "curve+HGBR v1", "trained_until": run["model_trained_until"], "features": 15},
        "run": {"id": run["id"], "created_at": run["created_at"], "status": run["status"], "weather_signature": run["weather_signature"]},
        "diff_vs_previous": diff,
    }
