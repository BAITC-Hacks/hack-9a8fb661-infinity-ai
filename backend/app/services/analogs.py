"""Память агента: поиск исторических аналогов (Analog Ensemble, Alessandrini et al., 2015).

Для выпуска D берём 48-часовой профиль прогнозной погоды (тот же тип данных — архивные прогнозы,
опубликованные до выпуска) и ищем среди прошлых дней (строго до D) самые похожие профили:
скорость ветра v_eq, направление (sin/cos), температура. Фактическая выработка этих дней —
«ансамбль аналогов»: альтернативный прогноз и разброс (Q10–Q90), а также проверка того,
как модель ошибалась в похожих условиях.
"""
import numpy as np
import pandas as pd

from app.core import config
from app.ml.data import station_series

K_DAYS = 8
MIN_HOURS = 40


def _profiles(weather: pd.DataFrame, issues: pd.DatetimeIndex) -> dict:
    """48-часовые профили прогнозной погоды для списка дат выпуска: часы +1..+24 — прогон за сутки, +25..+48 — за двое."""
    w = weather.set_index(["time", "lead_day"])
    out = {}
    for d in issues:
        targets = pd.date_range(d + pd.Timedelta(hours=1), periods=48, freq="h")
        lead = np.where(np.arange(1, 49) <= 24, 1, 2)
        idx = pd.MultiIndex.from_arrays([targets, lead])
        prof = w.reindex(idx)[["v_eq", "dir_sin", "dir_cos", "temperature_2m"]]
        if prof["v_eq"].notna().sum() >= MIN_HOURS:
            out[d] = (targets, prof.to_numpy(dtype=float))
    return out


def find_analogs(forecaster, issue_date: str, turbine: str = "STATION", k: int = K_DAYS) -> dict:
    issue = pd.Timestamp(issue_date, tz="UTC")
    weather = forecaster.train_weather()
    cur = _profiles(weather, pd.DatetimeIndex([issue]))
    if issue not in cur:
        from app.ml.features import make_features
        from app.ml.weather import forecast_for_issue
        w = make_features(forecast_for_issue(issue_date, offline=forecaster.offline))
        cur = _profiles(w, pd.DatetimeIndex([issue]))
    if issue not in cur:
        return {"error": "нет прогноза погоды для выпуска"}
    _, x = cur[issue]

    hist = forecaster.history if turbine != "STATION" else station_series(forecaster.history)
    hist = hist[hist["turbine"] == turbine].set_index("time")["power"]
    last_fact = hist.index.max()
    # кандидаты: прошлые выпуски, чей 48-часовой горизонт целиком известен до момента выпуска D
    first = weather["time"].min().normalize()
    cands = pd.date_range(first, min(issue, last_fact) - pd.Timedelta(hours=49), freq="D", tz=None)
    cands = cands.tz_localize("UTC") if cands.tz is None else cands
    profs = _profiles(weather, cands)

    scale = np.array([3.0, 0.7, 0.7, 8.0])        # нормировка: м/с, sin, cos, °C
    weight = np.array([1.0, 0.35, 0.35, 0.25])     # ветер важнее всего
    rows = []
    for d, (targets, y) in profs.items():
        m = ~np.isnan(x).any(1) & ~np.isnan(y).any(1)
        if m.sum() < MIN_HOURS:
            continue
        dist = float(np.sqrt(((((x[m] - y[m]) / scale) ** 2) * weight).sum(1).mean()))
        fact = hist.reindex(targets)
        if fact.notna().sum() < MIN_HOURS:
            continue
        rows.append((dist, d, targets, fact.to_numpy(dtype=float), y[:, 0]))
    rows.sort(key=lambda r: r[0])
    top = rows[:k]
    if not top:
        return {"error": "в истории нет похожих ситуаций"}

    rated = sum(t.rated_power_mw for t in config.TURBINES) if turbine == "STATION" else \
        next(t.rated_power_mw for t in config.TURBINES if t.id == turbine)
    facts = np.vstack([r[3] for r in top])                    # k × 48
    q10, q50, q90 = (np.nanpercentile(facts, q, axis=0) for q in (10, 50, 90))
    mean = np.nanmean(facts, axis=0)
    hours = pd.date_range(issue + pd.Timedelta(hours=1), periods=48, freq="h")
    return {
        "issue_date": issue_date, "turbine": turbine, "k": len(top), "candidates": len(rows),
        "method": "Analog Ensemble: 48-ч профиль прогнозной погоды (ветер, направление, температура), только дни до выпуска",
        "days": [{"issue_date": str(d.date()), "similarity": round(1 / (1 + dist), 3), "distance": round(dist, 3),
                  "mean_wind": round(float(np.nanmean(wv)), 2), "energy_mwh": round(float(np.nansum(f)) * rated, 1),
                  "mean_p": round(float(np.nanmean(f)), 3)} for dist, d, _, f, wv in top],
        "hourly": [{"target_time": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "mean": round(float(a), 4), "q10": round(float(b), 4),
                    "q50": round(float(c), 4), "q90": round(float(e), 4)} for t, a, b, c, e in zip(hours, mean, q10, q50, q90)],
        "energy_mwh": {"mean": round(float(np.nansum(mean)) * rated, 1), "q10": round(float(np.nansum(q10)) * rated, 1),
                       "q90": round(float(np.nansum(q90)) * rated, 1)},
    }
