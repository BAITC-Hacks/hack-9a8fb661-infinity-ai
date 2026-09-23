"""Метрики по нормализованной мощности (доля номинала)."""
import numpy as np
import pandas as pd


def mae(y, p):
    return float(np.mean(np.abs(np.asarray(y) - np.asarray(p))))


def rmse(y, p):
    return float(np.sqrt(np.mean((np.asarray(y) - np.asarray(p)) ** 2)))


def lead_bucket(lead_hours):
    return np.where(np.asarray(lead_hours) <= 24, "1-24h", "25-48h")


def summarize(df: pd.DataFrame, by=("turbine", "bucket")) -> pd.DataFrame:
    """df: actual, p_hat, baseline, lead_hours, turbine. Строки без факта отбрасываются.
    Skill = 1 - MAE_модели / MAE_персистентности."""
    d = df.dropna(subset=["actual", "p_hat"]).copy()
    if d.empty:
        return pd.DataFrame(columns=[*by, "n", "mae", "rmse", "mae_base", "skill"])
    d["bucket"] = lead_bucket(d["lead_hours"])
    rows = []
    for key, g in d.groupby(list(by)):
        gb = g.dropna(subset=["baseline"])
        m = mae(g["actual"], g["p_hat"])
        mb = mae(gb["actual"], gb["baseline"]) if len(gb) else np.nan
        rows.append({**dict(zip(by, key if isinstance(key, tuple) else (key,))),
                     "n": len(g), "mae": m, "rmse": rmse(g["actual"], g["p_hat"]),
                     "mae_base": mb, "skill": 1 - m / mb if mb and mb > 0 else np.nan})
    return pd.DataFrame(rows)
