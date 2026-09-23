"""Уведомления агента по выпуску прогноза.

Резкие изменения выработки: ΔP_h = P̂_{h+1} − P̂_h. Событие — если |ΔP| за час превышает
RAMP_PCT установленной мощности или суммарное изменение за окно 3 ч превышает RAMP3_PCT.
Порог задаётся под потребности оператора (по умолчанию 15 % / 30 % Pном).
"""
import pandas as pd

from app import db
from app.core import config
from app.ml.weather import forecast_for_issue

RAMP_PCT = 0.15
RAMP3_PCT = 0.30
CALM_P = 0.05
CUTOUT_MS = 22.0
ICING_T = -10.0
DIVERGE_DP = 0.10          # расхождение с прошлым выпуском, доля Pном

LOCAL = config.SOURCE_UTC_OFFSET


def _hm(ts) -> str:
    return (pd.Timestamp(ts) + pd.Timedelta(hours=LOCAL)).strftime("%H:%M")


def _daypart(ts) -> str:
    h = (pd.Timestamp(ts) + pd.Timedelta(hours=LOCAL)).hour
    return "ночью" if h < 6 else "утром" if h < 12 else "днём" if h < 18 else "вечером"


def _windows(mask: pd.Series):
    """Непрерывные отрезки True -> (start_idx, end_idx)."""
    out, start = [], None
    for i, v in enumerate(mask.tolist()):
        if v and start is None:
            start = i
        if not v and start is not None:
            out.append((start, i - 1)); start = None
    if start is not None:
        out.append((start, len(mask) - 1))
    return out


def build_alerts(issue_date: str, turbine: str = "STATION", lang: str = "ru") -> list[dict]:
    store = db.get_store()
    run = store.latest_run(issue_date)
    if not run:
        return []
    fc = store.forecasts(run["id"], turbine).sort_values("target_time").reset_index(drop=True)
    if fc.empty:
        return []
    fc["p_hat"] = fc["p_hat"].astype(float)
    fc["t"] = pd.to_datetime(fc["target_time"], utc=True)
    w = forecast_for_issue(issue_date, offline=True).set_index("time")
    prev_run = store.previous_run(issue_date)
    prev = None
    if prev_run:
        pv = store.forecasts(prev_run["id"], turbine)
        prev = dict(zip(pd.to_datetime(pv["target_time"], utc=True), pv["p_hat"].astype(float)))
    alerts: list[dict] = []
    rated = sum(t.rated_power_mw for t in config.TURBINES) if turbine == "STATION" else \
        next(t.rated_power_mw for t in config.TURBINES if t.id == turbine)

    def diverges(i0, i1) -> bool:
        if not prev:
            return False
        d = [abs(fc.loc[i, "p_hat"] - prev.get(fc.loc[i, "t"], fc.loc[i, "p_hat"])) for i in range(i0, i1 + 1)]
        return bool(d) and max(d) > DIVERGE_DP

    # 1. резкие изменения (ΔP за час и за 3 ч)
    dp = fc["p_hat"].diff().shift(-1)
    dp3 = fc["p_hat"].shift(-3) - fc["p_hat"]
    ramp = (dp.abs() > RAMP_PCT) | (dp3.abs() > RAMP3_PCT)
    for i0, i1 in _windows(ramp.fillna(False)):
        i1c = min(i1 + 1, len(fc) - 1)
        delta = fc.loc[i1c, "p_hat"] - fc.loc[i0, "p_hat"]
        if abs(delta) < RAMP_PCT:
            continue
        up = delta > 0
        div = diverges(i0, i1c)
        alerts.append({
            "kind": "ramp_up" if up else "ramp_down", "level": "warn" if abs(delta) < 0.5 else "critical",
            "start": fc.loc[i0, "target_time"], "end": fc.loc[i1c, "target_time"],
            "delta_mw": round(delta * rated, 2), "delta_pct": round(delta * 100),
            "text": f"{_daypart(fc.loc[i0, 't']).capitalize()} ожидается {'рост' if up else 'снижение'} мощности на "
                    f"{abs(delta) * rated:.1f} МВт ({abs(delta) * 100:.0f} % Pном). Наиболее вероятное окно — "
                    f"{_hm(fc.loc[i0, 't'])}–{_hm(fc.loc[i1c, 't'])}."
                    + (" В этом интервале сценарии заметно расходятся с прошлым выпуском." if div else ""),
        })
    # 2. штиль
    for i0, i1 in _windows(fc["p_hat"] < CALM_P):
        if i1 - i0 + 1 >= 3:
            alerts.append({"kind": "calm", "level": "info", "start": fc.loc[i0, "target_time"], "end": fc.loc[i1, "target_time"],
                           "text": f"Штиль {_hm(fc.loc[i0, 't'])}–{_hm(fc.loc[i1, 't'])}: выработка ниже 5 % Pном ({i1 - i0 + 1} ч)."})
    # 3. погода: отсечка по ветру, обледенение
    ws = w["wind_speed_100m"].reindex(fc["t"]).reset_index(drop=True)
    gs = w["wind_gusts_10m"].reindex(fc["t"]).reset_index(drop=True)
    tm = w["temperature_2m"].reindex(fc["t"]).reset_index(drop=True)
    for i0, i1 in _windows((ws > CUTOUT_MS) | (gs > CUTOUT_MS + 6)):
        alerts.append({"kind": "cutout", "level": "critical", "start": fc.loc[i0, "target_time"], "end": fc.loc[i1, "target_time"],
                       "text": f"Ветер до {max(ws[i0:i1 + 1].max(), 0):.0f} м/с, порывы до {gs[i0:i1 + 1].max():.0f} м/с "
                               f"({_hm(fc.loc[i0, 't'])}–{_hm(fc.loc[i1, 't'])}): возможна защитная остановка турбин при 25 м/с."})
    for i0, i1 in _windows(tm < ICING_T):
        if i1 - i0 + 1 >= 3:
            alerts.append({"kind": "icing", "level": "warn", "start": fc.loc[i0, "target_time"], "end": fc.loc[i1, "target_time"],
                           "text": f"Мороз до {tm[i0:i1 + 1].min():.0f} °C ({_hm(fc.loc[i0, 't'])}–{_hm(fc.loc[i1, 't'])}): риск обледенения лопастей и снижения выработки."})
    # 4. решения агента и достоверность
    if run["status"] == "low_confidence":
        alerts.append({"kind": "confidence", "level": "warn", "start": fc.loc[0, "target_time"], "end": fc.loc[len(fc) - 1, "target_time"],
                       "text": "Пониженная достоверность: во входных данных перед выпуском были пропуски."})
    for e in store.agent_log(issue_date, 60):
        if e.get("reason") and e["tool"] in ("replan", "analyze", "train_model"):
            alerts.append({"kind": "agent", "level": "info", "start": None, "end": None, "text": f"Агент: {e['reason']}."})
    order = {"critical": 0, "warn": 1, "info": 2}
    alerts.sort(key=lambda a: (order[a["level"]], a["start"] or ""))
    return alerts
