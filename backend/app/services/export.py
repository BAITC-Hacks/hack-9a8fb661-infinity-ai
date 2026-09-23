"""Артефакты для проверяющего: outputs/forecasts.csv и outputs/metrics.json."""
import json

from app import db
from app.core import config
from app.ml.metrics import summarize


def overall_metrics(fc) -> dict:
    """Сводка по выпускам, где есть факт (январский бэктест)."""
    if fc.empty:
        return {}
    fc = fc.astype({"actual": float, "baseline": float, "p_hat": float})
    return {
        "note": "Факт есть до 2026-01-31 23:00 UTC; февральские выпуски без факта не оцениваются.",
        "by_turbine_and_horizon": summarize(fc).round(4).to_dict("records"),
        "station_by_issue_date": summarize(fc[fc["turbine"] == "STATION"], by=("issue_date",))
        .round(4).to_dict("records"),
    }


def export_all():
    config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    fc = db.get_store().latest_forecasts()
    if fc.empty:
        raise RuntimeError("В БД нет прогнозов — сначала запустите backtest")
    fc = fc.drop(columns="run_id")
    fc.to_csv(config.OUTPUT_DIR / "forecasts.csv", index=False)
    fc[fc["issue_date"] >= config.FORECAST_ISSUES[0]].to_csv(
        config.OUTPUT_DIR / "forecasts_test_period.csv", index=False)
    m = overall_metrics(fc)
    (config.OUTPUT_DIR / "metrics.json").write_text(json.dumps(m, ensure_ascii=False, indent=2))
    return m
