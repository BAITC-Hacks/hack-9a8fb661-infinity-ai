"""Агент прогноза: инструменты + политика перепланирования + журнал решений.

Цикл на каждый момент выпуска: fetch_forecast -> prepare_features -> train_model (по
политике) -> predict -> analyze -> evaluate -> replan (пересчёт при обновлении данных
или деградации качества) -> report. Каждый шаг пишется в agent_log с причиной.
"""
import json
import logging
import uuid

import numpy as np
import pandas as pd

from app import db
from app.core import config
from app.services import llm
from app.ml.pipeline import Forecaster

log = logging.getLogger(__name__)

RETRAIN_EVERY_DAYS = 7
WEATHER_DELTA_MS = 1.5      # пересчёт/пометка ревизии при изменении ветра
GAP_LOW_CONF_H = 3          # пропуск факта подряд -> пониженная достоверность
MAE_DEGRADE_X = 2.0         # MAE выпуска > 2x среднего -> переобучить


class ForecastAgent:
    def __init__(self, forecaster: Forecaster | None = None):
        self.f = forecaster or Forecaster()
        self.session = uuid.uuid4().hex[:8]
        self.mae_history: list[float] = []
        self.force_retrain = False
        self.store = db.get_store()

    # --- журнал -----------------------------------------------------------
    def _log(self, issue, tool, params=None, result=None, reason=None):
        self.store.log_step(self.session, issue, tool, params, result, reason)
        log.info("[%s] %s %s | %s", issue, tool, json.dumps(result, default=str)[:160],
                 reason or "")

    # --- политика ---------------------------------------------------------
    def _needs_retrain(self, issue: pd.Timestamp):
        if not self.f.models:
            return "модели ещё нет"
        if self.force_retrain:
            return "качество прошлого выпуска деградировало"
        hist_end = self.f.history["time"].max()
        fresh_until = min(issue, hist_end + pd.Timedelta(hours=1))
        if (fresh_until - self.f.trained_until) >= pd.Timedelta(days=RETRAIN_EVERY_DAYS):
            return f"появилось ≥{RETRAIN_EVERY_DAYS} сут. новых фактов"
        return None

    @staticmethod
    def _signature(w: pd.DataFrame) -> float:
        return round(float(w["wind_speed_100m"].fillna(-1).sum()), 3)

    def _previous_forecast(self, issue_date):
        prev = self.store.previous_run(issue_date)
        if not prev:
            return None
        return self.store.forecasts(prev["id"], "STATION")[["target_time", "v_eq"]]

    # --- основной цикл ----------------------------------------------------
    def run_issue(self, issue_date: str, force=False) -> dict:
        issue = pd.Timestamp(issue_date).tz_localize("UTC")
        mode = "backtest" if issue < self.f.history["time"].max() else "forecast"
        # 1. погода на момент выпуска
        w = self.f.weather(issue_date)
        sig = self._signature(w)
        missing_w = int(w["v_eq"].isna().sum())
        leak = bool((w["run_time_max"] > issue).any())
        self._log(issue_date, "fetch_forecast",
                  {"issue_time": str(issue), "source": "open-meteo previous runs"},
                  {"hours": len(w), "missing_hours": missing_w,
                   "mean_wind_100m": round(float(w["wind_speed_100m"].mean()), 2),
                   "all_runs_before_issue": not leak})
        if leak:
            raise RuntimeError("Погода содержит прогоны позже момента выпуска")

        prev_run = self.store.latest_run(issue_date)
        if prev_run and not force and prev_run["weather_signature"] == sig:
            self._log(issue_date, "replan", {"prev_run": prev_run["id"]},
                      {"action": "skip"}, "входные данные не изменились — пересчёт не нужен")
            return prev_run
        if prev_run:
            self._log(issue_date, "replan", {"prev_run": prev_run["id"]},
                      {"action": "recompute"},
                      "погодный прогноз обновился" if prev_run["weather_signature"] != sig
                      else "принудительный пересчёт")

        # 2. подготовка данных
        hist_end = self.f.history["time"].max()
        after_hist = issue > hist_end + pd.Timedelta(hours=1)
        gap = 0 if after_hist else self.f.data_gaps(issue_date)
        low_conf = gap > GAP_LOW_CONF_H or missing_w > 0
        self._log(issue_date, "prepare_features",
                  {"features": len(w.columns)},
                  {"max_fact_gap_h": gap, "weather_missing_h": missing_w,
                   "low_confidence": low_conf},
                  f"пропуск факта {gap} ч подряд > {GAP_LOW_CONF_H} ч" if gap > GAP_LOW_CONF_H
                  else ("факт после 31.01 не предоставлен — модель использует историю до "
                        f"{hist_end:%Y-%m-%d %H:%M} UTC" if after_hist else None))

        # 3. обучение по политике
        reason = self._needs_retrain(issue)
        if reason:
            info = self.f.train(issue)
            self.force_retrain = False
            self._log(issue_date, "train_model", {"until": str(issue)}, info, reason)

        # 4. прогноз
        fc = self.f.predict(issue_date, weather=w)
        self._log(issue_date, "predict", {"horizon_h": config.HORIZON_H},
                  {"rows": len(fc), "trained_until": str(self.f.trained_until)})

        # 5. анализ результата
        stats = self._analyze(issue_date, fc, w, low_conf)

        # 6. оценка (если факт уже известен — бэктест)
        metrics = self.f.evaluate(fc)
        if not metrics.empty:
            st = metrics[metrics["turbine"] == "STATION"]
            mae_now = float(st["mae"].mean())
            self._log(issue_date, "evaluate", None,
                      st[["bucket", "mae", "rmse", "mae_base", "skill"]].round(4)
                      .to_dict("records"))
            # 7. перепланирование по качеству
            if self.mae_history and mae_now > MAE_DEGRADE_X * np.mean(self.mae_history):
                self.force_retrain = True
                self._log(issue_date, "replan", {"mae": round(mae_now, 4),
                          "mean_mae": round(float(np.mean(self.mae_history)), 4)},
                          {"action": "retrain_next"},
                          f"MAE выпуска > {MAE_DEGRADE_X}× среднего — переобучение")
            self.mae_history.append(mae_now)

        # 8. отчёт
        summary = llm.summarize_forecast(stats)
        self._log(issue_date, "report", {"llm": llm.provider()},
                  {"text": summary})

        run_id = self.store.create_run(issue_date, mode,
                                       "low_confidence" if low_conf else "ok",
                                       str(self.f.trained_until), sig, summary)
        self.store.insert_forecasts(run_id, _records(fc))
        if not metrics.empty:
            self.store.insert_metrics(run_id, issue_date, metrics.to_dict("records"))
        return self.store.latest_run(issue_date)

    def _analyze(self, issue_date, fc, w, low_conf) -> dict:
        st = fc[fc["turbine"] == "STATION"].sort_values("target_time")
        checks = {"in_range": bool(st["p_hat"].between(0, 1).all()),
                  "no_nan": bool(st["p_hat"].notna().all()),
                  "hours": int(len(st))}
        delta = None
        prev = self._previous_forecast(issue_date)
        if prev is not None and not prev.empty:
            prev["target_time"] = pd.to_datetime(prev["target_time"], utc=True)
            j = st.merge(prev, on="target_time", suffixes=("", "_prev"))
            if len(j):
                delta = round(float((j["v_eq"] - j["v_eq_prev"]).abs().mean()), 2)
        stats = {
            "issue_date": issue_date,
            "mean_p": round(float(st["p_hat"].mean()), 3),
            "max_p": round(float(st["p_hat"].max()), 3),
            "peak_time": str(st.loc[st["p_hat"].idxmax(), "target_time"])[:16],
            "calm_hours": int((st["p_hat"] < 0.05).sum()),
            "energy_48h_rated_hours": round(float(st["p_hat"].sum()), 2),
            "max_v": round(float(w["wind_speed_100m"].max()), 1),
            "min_temp": round(float(w["temperature_2m"].min()), 1)
            if w["temperature_2m"].notna().any() else None,
            "weather_delta": delta,
            "low_confidence": low_conf,
        }
        reason = None
        if delta is not None and delta > WEATHER_DELTA_MS:
            reason = (f"ветер в новом прогоне изменился на {delta} м/с > {WEATHER_DELTA_MS} — "
                      "перекрывающиеся часы пересчитаны, прошлый выпуск устарел")
        self._log(issue_date, "analyze", checks, stats, reason)
        if not (checks["in_range"] and checks["no_nan"]):
            raise RuntimeError(f"Проверка прогноза не пройдена: {checks}")
        return stats

    def run_range(self, start: str, end: str, force=False) -> list[dict]:
        out = []
        for d in pd.date_range(start, end, freq="D"):
            try:
                out.append(self.run_issue(str(d.date()), force=force))
            except Exception as e:
                log.exception("issue %s failed", d.date())
                self._log(str(d.date()), "error", None, {"error": str(e)},
                              "выпуск пропущен, цикл продолжается")
        return out


def _records(fc: pd.DataFrame):
    x = fc.copy()
    x["target_time"] = x["target_time"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    x = x.replace({np.nan: None})
    cols = ["issue_date", "target_time", "lead_hours", "turbine", "p_hat", "p_curve", "v_eq",
            "actual", "baseline"]
    return x[cols].to_dict("records")
