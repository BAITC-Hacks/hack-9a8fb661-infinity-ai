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
    for c in ("p_lo", "p_hi"):
        if c in fc:
            fc[c] = fc[c].astype(float)
    return {
        "note": "Факт есть до 2026-01-31 23:00 UTC; февральские выпуски без факта не оцениваются.",
        "by_turbine_and_horizon": summarize(fc).round(4).to_dict("records"),
        "station_by_issue_date": summarize(fc[fc["turbine"] == "STATION"], by=("issue_date",))
        .round(4).to_dict("records"),
        "daily": daily_errors(fc),
        "coverage": coverage(fc),
    }


def coverage(fc) -> list[dict]:
    """Доля фактов внутри диапазона Q10–Q90 (цель ≈ 80 %) и средняя ширина, по горизонтам."""
    import numpy as np
    if "p_lo" not in fc:
        return []
    d = fc.dropna(subset=["actual", "p_lo", "p_hi"]).copy()
    if d.empty:
        return []
    for c in ("actual", "p_lo", "p_hi"):
        d[c] = d[c].astype(float)
    d["bucket"] = np.where(d["lead_hours"].astype(int) <= 24, "1-24h", "25-48h")
    out = []
    for (tb, b), g in d.groupby(["turbine", "bucket"]):
        inside = ((g["actual"] >= g["p_lo"]) & (g["actual"] <= g["p_hi"])).mean()
        out.append({"turbine": tb, "bucket": b, "n": int(len(g)), "coverage": round(float(inside), 3),
                    "width": round(float((g["p_hi"] - g["p_lo"]).mean()), 3)})
    return out


def daily_errors(fc) -> list[dict]:
    """По дням выпуска: MAE базы (персистентность), модели на 1-24 ч и на 25-48 ч."""
    by_b = summarize(fc, by=("turbine", "issue_date", "bucket"))
    if by_b.empty:
        return []
    base = summarize(fc, by=("turbine", "issue_date"))[["turbine", "issue_date", "mae_base"]]
    wide = by_b.pivot_table(index=["turbine", "issue_date"], columns="bucket", values="mae")
    wide = wide.rename(columns={"1-24h": "mae_24", "25-48h": "mae_48"}).reset_index()
    out = wide.merge(base, on=["turbine", "issue_date"], how="left")
    return out.round(4).astype(object).where(out.notna(), None).to_dict("records")


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
