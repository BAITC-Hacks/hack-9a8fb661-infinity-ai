import numpy as np
import pandas as pd

from app.ml.metrics import summarize
from app.ml.model import PowerCurve


def test_power_curve_is_monotone_and_bounded():
    rng = np.random.default_rng(0)
    v = rng.uniform(0, 20, 5000)
    p = np.clip((v - 3) / 9, 0, 1) + rng.normal(0, 0.05, v.size)
    c = PowerCurve().fit(v, np.clip(p, 0, 1))
    grid = np.linspace(3, 20, 50)
    assert np.all(np.diff(c(grid)) >= -1e-9)
    assert c(np.array([0.5, 26.0])).tolist() == [0.0, 0.0], "ниже cut-in и выше cut-out — 0"


def test_forecast_beats_persistence_on_january(forecaster):
    from app.ml.pipeline import Forecaster
    f = Forecaster(history=forecaster.history, offline=True)
    f.train("2026-01-22")
    fc = f.predict("2026-01-22")
    m = summarize(fc)
    st = m[m["turbine"] == "STATION"]
    assert len(fc) == 48 * 3
    assert fc["p_hat"].between(0, 1).all()
    assert (st["mae"] < 0.3).all()


def test_summarize_skill():
    df = pd.DataFrame({"turbine": "T1", "lead_hours": [1, 2], "actual": [0.5, 0.5],
                       "p_hat": [0.4, 0.6], "baseline": [0.3, 0.7]})
    r = summarize(df).iloc[0]
    assert round(r["mae"], 3) == 0.1 and round(r["skill"], 3) == 0.5
