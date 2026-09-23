import pandas as pd
import pytest

from app.ml.data import load_history, station_series, to_hourly


def test_to_hourly_converts_local_time_to_utc_centered():
    raw = pd.DataFrame({
        "time": pd.date_range("2026-01-01 04:30", periods=12, freq="10min"),  # UTC+5
        "wind_speed": [8.0] * 12, "power": [0.5] * 6 + [0.2] * 6, "temperature": [1.0] * 12,
    })
    h = to_hourly(raw, utc_offset=5)
    assert str(h["time"].dt.tz) == "UTC"
    assert h["time"].iloc[0] == pd.Timestamp("2026-01-01 00:00", tz="UTC")
    assert len(h) == 2
    assert h["power"].tolist() == pytest.approx([0.5, 0.2])


def test_downtime_flag():
    raw = pd.DataFrame({"time": pd.date_range("2026-01-01 00:30", periods=6, freq="10min"),
                        "wind_speed": [9.0] * 6, "power": [0.0] * 6, "temperature": [0.0] * 6})
    h = to_hourly(raw, utc_offset=0)
    assert len(h) == 1 and h["is_downtime"].all()


@pytest.mark.parametrize("fault", ["missing", "duplicate", "off_grid", "nan", "infinite", "out_of_range", "missing_weather"])
def test_incomplete_or_invalid_hour_is_not_a_fact(fault):
    raw = pd.DataFrame({"time": pd.date_range("2026-01-01 00:30", periods=6, freq="10min"),
                        "wind_speed": [8.0] * 6, "power": [0.5] * 6, "temperature": [1.0] * 6})
    if fault == "missing":
        raw = raw.iloc[:5]
    elif fault == "duplicate":
        raw.loc[5, "time"] = raw.loc[4, "time"]
    elif fault == "off_grid":
        raw.loc[5, "time"] += pd.Timedelta(minutes=1)
    elif fault == "missing_weather":
        raw.loc[5, "temperature"] = float("nan")
    else:
        raw.loc[5, "power"] = {"nan": float("nan"), "infinite": float("inf"), "out_of_range": 1.1}[fault]
    assert to_hourly(raw, utc_offset=0).empty


def test_station_requires_both_turbines_and_sums_their_power():
    h = pd.DataFrame({
        "time": pd.to_datetime(["2026-01-01T00:00Z"] * 2 + ["2026-01-01T01:00Z", "2026-01-01T02:00Z"] * 2),
        "turbine": ["T1", "T2", "T1", "T1", "T1", "T2"],
        "power": [0.2, 0.8, 0.6, 0.5, 0.6, float("nan")],
        "wind_speed": [8.0] * 6, "temperature": [1.0] * 6, "is_downtime": [False] * 6,
    })
    station = station_series(h)
    assert len(station) == 1
    assert station.iloc[0]["power"] * 5 == pytest.approx(0.2 * 2.5 + 0.8 * 2.5)
    assert station_series(h.iloc[:1]).empty, "одна турбина не заменяет всю станцию"


def test_history_ends_before_test_period():
    h = load_history()
    assert set(h["turbine"]) == {"T1", "T2"}
    assert h["time"].max() < pd.Timestamp("2026-02-01", tz="UTC")
    assert h["power"].between(0, 1).all()
