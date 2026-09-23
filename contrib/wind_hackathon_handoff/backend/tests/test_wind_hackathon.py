"""Run without web-app fixtures: python -m unittest backend.tests.test_wind_hackathon."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from backend.app.forecasting.wind_hackathon import (
    TurbineModel,
    complete_actual_points,
    features,
    interpolate_weather,
    local_time,
    physical_curve,
    power_rows,
    predict_object,
    prepare_actuals,
    prepare_weather,
)
from backend.app.forecasting.wind_hackathon_io import forecast, load_bundle, train


def weather_rows(origin, *, oid=1, wind=7.0, issue=None, hours=49):
    origin = local_time(origin)
    issue = local_time(issue) if issue is not None else origin - pd.Timedelta(hours=8)
    return [
        {
            "object_id": oid,
            "provider": "test",
            "weather_model": "test",
            "issued_at": issue,
            "available_at": issue + pd.Timedelta(hours=8),
            "valid_at": t,
            "wind_speed_80m_ms": wind,
            "temperature_2m_c": 10.0,
            "wind_direction_80m_deg": 350.0,
        }
        for t in pd.date_range(origin, periods=hours, freq="h")
    ]


def facts(start, count, *, oid=1, power=0.01):
    return [
        {"object_id": oid, "timestamp": t, "avg_wind": 2.0, "avg_tmp": 10.0, "power_normalized": power}
        for t in pd.date_range(local_time(start), periods=count, freq="10min")
    ]


class ConstantCorrection:
    def predict(self, frame):
        return np.full(len(frame), 0.02)


def constant_model():
    run = prepare_weather(weather_rows("2026-02-01"))
    prepared = interpolate_weather(run, pd.date_range(local_time("2026-02-01"), periods=6, freq="10min"))
    return TurbineModel(ConstantCorrection(), 1.0, list(features(prepared)), {})


class WindTests(unittest.TestCase):
    def test_missing_hour_is_not_zero_and_low_wind_power_is_kept(self):
        rows = facts("2025-01-01", 12)
        del rows[8]
        hours = prepare_actuals(rows)
        self.assertEqual(len(hours), 1)
        self.assertAlmostEqual(hours.power_normalized.iloc[0], 0.01)
        self.assertEqual(len(complete_actual_points(rows)), 6)

    def test_null_and_out_of_range_labels_exclude_the_hour(self):
        for bad in (None, -0.1, 1.1, float("inf")):
            rows = facts("2025-01-01", 12)
            rows[0]["power_normalized"] = bad
            self.assertEqual(len(prepare_actuals(rows)), 1)

    def test_duplicates_and_off_grid_are_rejected(self):
        rows = facts("2025-01-01", 6)
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            prepare_actuals(rows + rows[:1])
        rows[0]["timestamp"] += pd.Timedelta(minutes=1)
        with self.assertRaisesRegex(ValueError, "grid"):
            prepare_actuals(rows)

    def test_timezone_preserves_fixed_plus_five_in_2023(self):
        self.assertEqual(local_time("2023-03-11T00:00").hour, 0)
        self.assertEqual(local_time("2023-03-11T00:00Z").hour, 5)

    def test_passport_baseline_does_not_force_final_power_to_zero(self):
        np.testing.assert_allclose(physical_curve([2, 3, 10.3, 25, 26]), [0, 0, 1, 1, 0])
        run = prepare_weather(weather_rows("2026-02-01", wind=2.0))
        values, _, _ = predict_object(constant_model(), run, "2026-02-01")
        np.testing.assert_allclose(values, 0.02)

    def test_future_issue_and_incomplete_latest_issue_are_not_used(self):
        origin = local_time("2026-02-01")
        old = weather_rows(origin, issue=origin - pd.Timedelta(hours=20), wind=4)
        incomplete = weather_rows(origin, issue=origin - pd.Timedelta(hours=8), hours=30, wind=9)
        future = weather_rows(origin, issue=origin, wind=15)
        values, used, failures = predict_object(
            constant_model(), prepare_weather(old + incomplete + future), origin
        )
        self.assertEqual(used.issued_at, origin - pd.Timedelta(hours=20))
        self.assertEqual(len(values), 288)
        self.assertTrue(failures)

    def test_unknown_publication_needs_explicit_assumption(self):
        rows = weather_rows("2026-02-01")
        for row in rows:
            row["available_at"] = None
        with self.assertRaisesRegex(ValueError, "availability"):
            prepare_weather(rows)
        frame = prepare_weather(rows, 8)
        self.assertEqual(frame.available_at.iloc[0], local_time("2026-02-01"))

    def test_direction_interpolates_across_north_and_wind_100m_fallback(self):
        rows = weather_rows("2026-02-01", hours=2)
        for row, direction in zip(rows, [350, 10], strict=True):
            row["wind_speed_100m_ms"] = row.pop("wind_speed_80m_ms")
            row["wind_direction_100m_deg"] = direction
        index = pd.date_range(local_time("2026-02-01"), periods=6, freq="10min")
        prepared = interpolate_weather(prepare_weather(rows), index)
        direction = prepared.direction_deg.iloc[3]
        self.assertTrue(direction < 1 or direction > 359)
        self.assertEqual(prepared.weather_height_m.iloc[0], 100)

    def test_energy_is_integrated_not_summed_power(self):
        values = pd.Series(
            [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
            index=pd.date_range(local_time("2026-02-01"), periods=6, freq="10min"),
        )
        rows = power_rows(values, 2.5, {})
        hourly = rows[-1]
        self.assertEqual(hourly["period_type"], "hour")
        self.assertAlmostEqual(hourly["power_mw"], 0.875)
        self.assertAlmostEqual(hourly["energy_mwh"], sum(r["energy_mwh"] for r in rows[:-1]))

    def test_train_save_reload_predict_two_objects_without_database(self):
        start, cutoff = local_time("2025-01-01"), local_time("2025-01-15")
        objects = [{"object_id": i, "rated_power_mw": 2.5} for i in (1, 2)]
        all_weather = []
        all_facts = []
        for oid in (1, 2):
            all_facts += facts(start, 14 * 144, oid=oid, power=0.02)
            for day in range(15):
                all_weather += weather_rows(start + pd.Timedelta(days=day), oid=oid, wind=2)

        class Store:
            written = None

            def objects(self):
                return objects

            def actuals(self, start, cutoff):
                return all_facts

            def weather(self, start, end, provider, weather_model):
                return [r for r in all_weather if start <= r["valid_at"] <= end]

            def write_forecast(self, rows):
                self.written = rows

        store = Store()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "model.joblib"
            result = train(
                store,
                start=start,
                cutoff=cutoff,
                artifact=path,
                provider="test",
                weather_model="test",
                publication_lag_hours=None,
                validation_days=3,
            )
            self.assertLess(result["validation"][1]["mae_cf"], 0.001)
            bundle = load_bundle(path)
            with self.assertRaisesRegex(ValueError, "cutoff"):
                forecast(store, bundle, origin=start)
            prediction = forecast(store, bundle, origin=cutoff)
            self.assertEqual(prediction["rows"], 2 * (288 + 48))
            self.assertEqual(len(store.written), prediction["rows"])
            self.assertTrue(all(r["actuals_cutoff"] == cutoff.isoformat() for r in store.written))


if __name__ == "__main__":
    unittest.main()
