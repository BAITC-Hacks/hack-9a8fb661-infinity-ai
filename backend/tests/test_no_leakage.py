"""Главное правило кейса: прогноз строится только из данных, известных на момент выпуска."""
import pandas as pd
import pytest

from app.ml.weather import forecast_for_issue


@pytest.mark.parametrize("issue", ["2026-01-31", "2026-02-14", "2026-02-27"])
def test_weather_runs_are_issued_before_forecast_time(issue):
    w = forecast_for_issue(issue, offline=True)
    t0 = pd.Timestamp(issue, tz="UTC")
    assert len(w) == 48
    assert (w["run_time_max"] <= t0).all(), "прогон погоды позже момента выпуска"
    assert w.loc[w["lead_hours"] <= 24, "lead_day"].eq(1).all()
    assert w.loc[w["lead_hours"] > 24, "lead_day"].eq(2).all()


def test_only_previous_run_variables_requested():
    from app.ml import weather
    params = [f"{v}_previous_day{d}" for d in weather.LEAD_DAYS for v in weather.VARIABLES]
    assert all("previous_day" in p for p in params)


def test_model_trained_after_issue_is_rejected(forecaster):
    with pytest.raises(RuntimeError, match="Утечка"):
        forecaster.predict("2026-01-10")   # модель обучена до 20.01


def test_training_uses_only_past(forecaster):
    df = forecaster.training_frame("T1", pd.Timestamp("2026-01-20", tz="UTC"))
    assert df["time"].max() < pd.Timestamp("2026-01-20", tz="UTC")
