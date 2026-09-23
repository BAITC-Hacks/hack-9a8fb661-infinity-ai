import pandas as pd

from app.ml.data import load_history, to_hourly


def test_to_hourly_converts_local_time_to_utc_centered():
    raw = pd.DataFrame({
        "time": pd.date_range("2026-01-01 05:00", periods=12, freq="10min"),  # UTC+5
        "wind_speed": [8.0] * 12, "power": [0.5] * 6 + [-0.1] * 6, "temperature": [1.0] * 12,
    })
    h = to_hourly(raw, utc_offset=5)
    assert str(h["time"].dt.tz) == "UTC"
    assert h["time"].iloc[0] == pd.Timestamp("2026-01-01 00:00", tz="UTC")
    assert (h["power"] >= 0).all(), "отрицательная мощность обрезается до 0"


def test_downtime_flag():
    raw = pd.DataFrame({"time": pd.date_range("2026-01-01", periods=6, freq="10min"),
                        "wind_speed": [9.0] * 6, "power": [0.0] * 6, "temperature": [0.0] * 6})
    assert to_hourly(raw, utc_offset=0)["is_downtime"].all()


def test_history_ends_before_test_period():
    h = load_history()
    assert set(h["turbine"]) == {"T1", "T2"}
    assert h["time"].max() < pd.Timestamp("2026-02-01", tz="UTC")
    assert h["power"].between(0, 1).all()
