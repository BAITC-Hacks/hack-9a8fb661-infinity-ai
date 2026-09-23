"""Обучение и прогноз на момент issue_date без заглядывания в будущее."""
import logging

import numpy as np
import pandas as pd

from app.core import config
from app.ml.data import load_history, station_series
from app.ml.features import make_features
from app.ml.metrics import summarize
from app.ml.model import WindPowerModel
from app.ml.weather import forecast_for_issue, load_weather

log = logging.getLogger(__name__)
TURBINE_IDS = [t.id for t in config.TURBINES]


class Forecaster:
    def __init__(self, history: pd.DataFrame | None = None, offline=None):
        self.history = history if history is not None else load_history()
        self.offline = offline
        self.models: dict[str, WindPowerModel] = {}
        self.trained_until: pd.Timestamp | None = None
        self._train_weather = None

    # --- данные -----------------------------------------------------------
    def train_weather(self):
        if self._train_weather is None:
            start = self.history["time"].min().tz_localize(None).normalize()
            end = pd.Timestamp(config.HISTORY_END)
            self._train_weather = make_features(load_weather(start, end, offline=self.offline))
        return self._train_weather

    def training_frame(self, turbine, until: pd.Timestamp) -> pd.DataFrame:
        """Факт до until (строго раньше) + архивный прогноз на те же часы."""
        h = self.history[(self.history["turbine"] == turbine) & (self.history["time"] < until)]
        h = h[~h["is_downtime"]]
        return h[["time", "power"]].merge(self.train_weather(), on="time", how="inner")

    # --- модель -----------------------------------------------------------
    def train(self, until) -> dict:
        until = pd.Timestamp(until)
        until = until.tz_localize("UTC") if until.tzinfo is None else until
        info = {}
        for tid in TURBINE_IDS:
            df = self.training_frame(tid, until)
            if len(df) < 1000:
                raise ValueError(f"{tid}: мало обучающих строк ({len(df)}) до {until}")
            self.models[tid] = WindPowerModel().fit(df, df["power"])
            info[tid] = {"rows": len(df), "from": str(df["time"].min()), "to": str(df["time"].max())}
        self.trained_until = until
        log.info("trained until %s: %s", until, info)
        return info

    def weather(self, issue_date) -> pd.DataFrame:
        return make_features(forecast_for_issue(issue_date, offline=self.offline))

    def predict(self, issue_date, weather: pd.DataFrame | None = None) -> pd.DataFrame:
        if not self.models:
            raise RuntimeError("Модель не обучена")
        issue = pd.Timestamp(issue_date).tz_localize("UTC")
        if self.trained_until is not None and self.trained_until > issue:
            raise RuntimeError("Утечка: модель обучена на данных позже момента выпуска")
        w = self.weather(issue_date) if weather is None else weather
        ok = w.dropna(subset=["v_eq"])
        parts = []
        for tid, m in self.models.items():
            curve, p = m.predict_parts(ok)
            parts.append(pd.DataFrame({"target_time": ok["time"].values,
                                       "lead_hours": ok["lead_hours"].values, "turbine": tid,
                                       "p_hat": p, "p_curve": curve, "v_eq": ok["v_eq"].values}))
        fc = pd.concat(parts, ignore_index=True)
        st = fc.groupby(["target_time", "lead_hours"], as_index=False)[
            ["p_hat", "p_curve", "v_eq"]].mean()
        st["turbine"] = "STATION"
        fc = pd.concat([fc, st], ignore_index=True)
        fc["target_time"] = pd.to_datetime(fc["target_time"], utc=True)
        fc["issue_date"] = str(pd.Timestamp(issue_date).date())
        return self._attach_actuals(fc, issue)

    # --- факт и база ------------------------------------------------------
    def _all_series(self):
        return pd.concat([self.history, station_series(self.history)], ignore_index=True)

    def _attach_actuals(self, fc, issue):
        """actual — факт на целевой час (для оценки); baseline — персистентность:
        мощность в тот же час последних суток, известных к моменту выпуска."""
        s = self._all_series().set_index(["turbine", "time"])["power"]
        lag = np.where(fc["lead_hours"] <= 24, 24, 48)
        base_t = fc["target_time"] - pd.to_timedelta(lag, unit="h")
        fc["actual"] = [s.get((t, x), np.nan) for t, x in zip(fc["turbine"], fc["target_time"])]
        fc["baseline"] = [s.get((t, x), np.nan) if x <= issue else np.nan
                          for t, x in zip(fc["turbine"], base_t)]
        return fc

    @staticmethod
    def evaluate(fc: pd.DataFrame) -> pd.DataFrame:
        return summarize(fc)

    def data_gaps(self, issue_date, window_h=72) -> int:
        """Максимальный подряд пропуск (часы) в факте перед выпуском."""
        issue = pd.Timestamp(issue_date).tz_localize("UTC")
        s = self.history[self.history["turbine"] == TURBINE_IDS[0]]["time"]
        s = s[(s < issue) & (s >= issue - pd.Timedelta(hours=window_h))].sort_values()
        grid = pd.date_range(issue - pd.Timedelta(hours=window_h), issue - pd.Timedelta(hours=1),
                             freq="h")
        missing = ~grid.isin(s)
        best = cur = 0
        for m in missing:
            cur = cur + 1 if m else 0
            best = max(best, cur)
        return int(best)
