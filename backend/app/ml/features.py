"""Признаки из архивного прогноза погоды (без фактов о будущем)."""
import numpy as np
import pandas as pd

R_DRY_AIR = 287.05
RHO_STD = 1.225

BASE_FEATURES = ["v_eq", "v_eq2", "v_eq3", "dir_sin", "dir_cos", "gust_ratio", "v_roll3",
                 "v_diff", "temperature_2m", "rho", "hour_sin", "hour_cos", "month", "lead_day",
                 "curve"]
# Погодный контекст соседних часов того же прогона (GEFCom2014, Landry et al., 2016):
# сдвиг усиления ветра на час-другой раньше/позже модель видит напрямую.
CONTEXT = [f"v_eq_{s}{k}" for k in (1, 2, 3) for s in ("m", "p")]
# Эксперимент (python -m app.cli experiments): контекст ухудшил MAE на январе (0.142 → 0.155 на 1–24 ч),
# гипотеза отклонена — в рабочей модели только базовые признаки.
FEATURES = BASE_FEATURES


def make_features(w: pd.DataFrame) -> pd.DataFrame:
    """w: time, lead_day, wind_speed_100m, wind_direction_100m, wind_gusts_10m,
    temperature_2m, surface_pressure (гПа). Скользящие признаки считаются внутри
    одного lead_day, чтобы не смешивать прогоны."""
    x = w.sort_values(["lead_day", "time"]).copy()
    v = x["wind_speed_100m"].clip(lower=0)
    pressure = x["surface_pressure"].fillna(x["surface_pressure"].median()).fillna(1013.25)
    temp = x["temperature_2m"].fillna(x["temperature_2m"].median()).fillna(15.0)
    x["rho"] = pressure * 100 / (R_DRY_AIR * (temp + 273.15))
    x["v_eq"] = v * (x["rho"] / RHO_STD) ** (1 / 3)
    x["v_eq2"] = x["v_eq"] ** 2
    x["v_eq3"] = x["v_eq"] ** 3
    rad = np.radians(x["wind_direction_100m"])
    x["dir_sin"], x["dir_cos"] = np.sin(rad), np.cos(rad)
    x["gust_ratio"] = x["wind_gusts_10m"] / v.clip(lower=0.1)
    g = x.groupby("lead_day")["v_eq"]
    x["v_roll3"] = g.transform(lambda s: s.rolling(3, center=True, min_periods=1).mean())
    x["v_diff"] = g.diff().fillna(0)
    for k in (1, 2, 3):   # только значения того же прогноза погоды — будущие прогнозные часы допустимы, факт — нет
        x[f"v_eq_m{k}"] = g.shift(k)
        x[f"v_eq_p{k}"] = g.shift(-k)
    hour = x["time"].dt.hour
    x["hour_sin"], x["hour_cos"] = np.sin(2 * np.pi * hour / 24), np.cos(2 * np.pi * hour / 24)
    x["month"] = x["time"].dt.month
    return x.sort_index()
