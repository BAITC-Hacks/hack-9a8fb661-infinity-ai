"""Таблица доказательств: вклад каждого усложнения на январском бэктесте (выпуски 01.01–30.01.2026).

Все варианты обучаются одинаково: только на данных строго до выпуска, переобучение раз в 7 суток,
погода — архивные прогнозы на момент выпуска. Метрика — MAE станции в долях Pном по горизонтам.
"""
import json

import numpy as np
import pandas as pd

from app.core import config
from app.ml.data import station_series
from app.ml.features import BASE_FEATURES, CONTEXT
from app.ml.model import WindPowerModel
from app.ml.pipeline import Forecaster, TURBINE_IDS

VARIANTS = {
    "curve": "Кривая мощности (прогнозный ветер 100 м → мощность)",
    "boost": "+ бустинг остатков (направление, порывы, сезон, час, горизонт)",
    "boost_ctx": "+ погодный контекст ±1–3 ч (GEFCom2014)",
    "analogs": "Analog Ensemble: среднее факта 8 похожих дней",
    "blend": "Смесь: 0.7 × бустинг с контекстом + 0.3 × аналоги",
}


def run(start="2026-01-01", end="2026-01-30", retrain_days=7) -> dict:
    from app.services.analogs import find_analogs
    f = Forecaster(offline=True)
    st = station_series(f.history).set_index("time")["power"]
    models: dict = {}
    rows = []
    for i, d in enumerate(pd.date_range(start, end, freq="D")):
        issue = d.tz_localize("UTC")
        if i % retrain_days == 0:
            for tid in TURBINE_IDS:
                df = f.training_frame(tid, issue)
                models[(tid, "base")] = WindPowerModel(features=BASE_FEATURES).fit(df, df["power"])
                models[(tid, "ctx")] = WindPowerModel(features=BASE_FEATURES + CONTEXT).fit(df, df["power"])
        w = f.weather(str(d.date())).dropna(subset=["v_eq"])
        preds = {"curve": [], "boost": [], "boost_ctx": []}
        for tid in TURBINE_IDS:
            c, pb = models[(tid, "base")].predict_parts(w)
            _, pc = models[(tid, "ctx")].predict_parts(w)
            preds["curve"].append(c); preds["boost"].append(pb); preds["boost_ctx"].append(pc)
        an = find_analogs(f, str(d.date()), "STATION")
        amap = {pd.Timestamp(h["target_time"]): h["mean"] for h in an.get("hourly", [])}
        for j, (t, lead) in enumerate(zip(w["time"], w["lead_hours"])):
            y = st.get(t, np.nan)
            base_t = t - pd.Timedelta(hours=24 if lead <= 24 else 48)
            r = {"issue": str(d.date()), "lead": int(lead), "actual": y,
                 "persistence": st.get(base_t, np.nan) if base_t <= issue else np.nan,
                 "analogs": amap.get(t, np.nan)}
            for k, v in preds.items():
                r[k] = float(np.mean([v[0][j], v[1][j]]))
            r["blend"] = 0.7 * r["boost_ctx"] + 0.3 * r["analogs"] if not np.isnan(r["analogs"]) else r["boost_ctx"]
            rows.append(r)
    df = pd.DataFrame(rows).dropna(subset=["actual"])
    out = []
    for bucket, g in (("1-24h", df[df.lead <= 24]), ("25-48h", df[df.lead > 24])):
        base = np.abs(g["actual"] - g["persistence"]).mean()
        for key, name in VARIANTS.items():
            m = np.abs(g["actual"] - g[key]).mean()
            out.append({"variant": key, "name": name, "bucket": bucket, "n": int(g[key].notna().sum()),
                        "mae": round(float(m), 4), "mae_mw": round(float(m) * 5, 3),
                        "bias": round(float((g[key] - g["actual"]).mean()), 4),
                        "vs_persistence": round(float(1 - m / base), 4)})
    res = {"period": f"{start}..{end}", "retrain_days": retrain_days, "persistence_mae": {
        b: round(float(np.abs(g["actual"] - g["persistence"]).mean()), 4)
        for b, g in (("1-24h", df[df.lead <= 24]), ("25-48h", df[df.lead > 24]))}, "rows": out}
    (config.OUTPUT_DIR / "experiments.json").write_text(json.dumps(res, ensure_ascii=False, indent=2))
    return res
