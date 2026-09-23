"""Offline integration tests of fetching, point mapping, leakage and recovery."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from backend.app.forecasting.wind_hackathon import local_time
from backend.app.forecasting.wind_hackathon_agent import WindAgent, analyze, evaluate
from backend.app.forecasting.wind_hackathon_io import forecast
from backend.app.forecasting.wind_noaa_archive import field_ranges
from backend.app.forecasting.wind_weather_archive import (
    VARIABLES,
    ArchiveError,
    OpenMeteoArchive,
    fetch_for_origin,
)
from backend.tests.test_wind_hackathon import constant_model, facts, weather_rows

OBJECTS = [
    {"object_id": i, "latitude": 43.645 - i * 0.001, "longitude": 78.535 + i * 0.001, "rated_power_mw": 2.5}
    for i in (1, 2)
]


class MemoryStore:
    def __init__(self):
        self.weather_data = []
        self.writes = []

    def objects(self):
        return OBJECTS

    def weather(self, start, end, provider, model):
        return [
            r for r in self.weather_data if local_time(start) <= local_time(r["valid_at"]) <= local_time(end)
        ]

    def write_weather(self, rows):
        def key(r):
            return tuple(str(r[k]) for k in ("object_id", "issued_at", "valid_at"))

        merged = {key(r): r for r in self.weather_data}
        merged.update({key(r): r for r in rows})
        self.weather_data = list(merged.values())

    def write_forecast(self, rows):
        self.writes.append(rows)


def bundle():
    return {
        "objects": OBJECTS,
        "models": {i: constant_model() for i in (1, 2)},
        "provider": "test",
        "weather_model": "test",
        "publication_lag_hours": None,
        "trained_until": "2026-01-31T00:00:00+05:00",
        "model_version": "test-v1",
    }


class WeatherAgentTests(unittest.TestCase):
    def test_open_meteo_maps_both_coordinates_units_issue_and_cache(self):
        issue = pd.Timestamp("2026-02-01T00:00Z")
        payload = []
        for n, _obj in enumerate(OBJECTS):
            hourly = {key: [7 + n] * 120 for key in VARIABLES}
            hourly["time"] = [
                t.strftime("%Y-%m-%dT%H:%M") for t in pd.date_range(issue, periods=120, freq="h")
            ]
            payload.append(
                {
                    "location_id": n,
                    "latitude": 43.6,
                    "longitude": 78.5,
                    "hourly": hourly,
                    "hourly_units": {"wind_speed_100m": "m/s", "temperature_2m": "°C"},
                }
            )

        class Session:
            calls = []

            def get(self, url, **kwargs):
                self.calls.append(kwargs)

                class Response:
                    url = "https://single-runs-api.open-meteo.com/v1/forecast?run=2026-02-01T00:00"

                    def raise_for_status(self):
                        pass

                    def json(self):
                        return payload

                return Response()

        with tempfile.TemporaryDirectory() as tmp:
            session = Session()
            source = OpenMeteoArchive(tmp, session=session, allow_hindcast=True)
            rows = source.fetch(OBJECTS, issue)
            self.assertEqual(len(rows), 240)
            self.assertEqual(
                session.calls[0]["params"]["latitude"], ",".join(str(o["latitude"]) for o in OBJECTS)
            )
            self.assertEqual(
                session.calls[0]["params"]["longitude"], ",".join(str(o["longitude"]) for o in OBJECTS)
            )
            self.assertEqual(rows[0]["available_at"], "2026-02-01T13:00:00+05:00")
            self.assertEqual(rows[120]["wind_speed_100m_ms"], 8)
            self.assertEqual(rows[0]["archive_kind"], "hindcast_unverified")
            self.assertEqual(source.fetch(OBJECTS, issue), rows)
            self.assertEqual(len(session.calls), 1)
            with self.assertRaisesRegex(ArchiveError, "hindcasts"):
                OpenMeteoArchive(tmp, session=session).fetch(OBJECTS, issue)

    def test_future_publication_and_partial_source_fall_back_without_partial_insert(self):
        origin = local_time("2026-02-01")

        class Source:
            def candidates(self, origin):
                return [origin - pd.Timedelta(hours=n) for n in (4, 8, 14)]

            def fetch(self, objects, issue, **kwargs):
                rows = []
                for obj in objects:
                    rows += weather_rows(
                        origin,
                        oid=obj["object_id"],
                        issue=issue,
                        hours=30 if issue.hour == (origin - pd.Timedelta(hours=8)).hour else 49,
                    )
                for row in rows:
                    row["archive_kind"] = "test"
                return rows

        store = MemoryStore()
        result = fetch_for_origin(store, Source(), OBJECTS, origin)
        self.assertEqual(len(result["rejected"]), 2)
        self.assertEqual(len(store.weather_data), 98)

    def test_agent_skip_weather_revision_analysis_and_restart(self):
        origin = local_time("2026-02-01")
        store = MemoryStore()
        for oid in (1, 2):
            store.write_weather(weather_rows(origin, oid=oid))
        with tempfile.TemporaryDirectory() as tmp:
            agent = WindAgent(store, bundle(), None, tmp)
            first = agent.run(origin)
            self.assertEqual(first["rows"], 672)
            self.assertEqual(agent.run(origin)["status"], "unchanged")
            self.assertEqual(WindAgent(store, bundle(), None, tmp).run(origin)["run_id"], first["run_id"])
            self.assertEqual(len(store.writes), 1)
            for row in store.weather_data:
                row["wind_speed_80m_ms"] = 8
            revised = agent.run(origin)
            self.assertNotEqual(first["run_id"], revised["run_id"])
            self.assertGreater(revised["analysis"]["max_change_cf"], 0)
            self.assertEqual(len(store.writes), 2)
            events = [
                json.loads(x)["decision"] for x in (Path(tmp) / "decisions.jsonl").read_text().splitlines()
            ]
            self.assertIn("unchanged_skip", events)
            self.assertIn("quality_passed", events)

    def test_quality_gates_prevent_bad_aggregation(self):
        store = MemoryStore()
        for oid in (1, 2):
            store.write_weather(weather_rows("2026-02-01", oid=oid))
        rows = forecast(store, bundle(), origin="2026-02-01", persist=False)["data"]
        rows[0]["energy_mwh"] *= 6
        with self.assertRaisesRegex(ValueError, "energy"):
            analyze(rows, OBJECTS, "2026-02-01", 48)

    def test_no_february_actuals_returns_pending_and_missing_hours_excluded(self):
        store = MemoryStore()
        for oid in (1, 2):
            store.write_weather(weather_rows("2026-02-01", oid=oid))
        rows = forecast(store, bundle(), origin="2026-02-01", persist=False)["data"]
        self.assertEqual(evaluate(rows, [], "2026-02-01", "2026-03-01")["status"], "awaiting_actuals")
        actuals = facts("2026-02-01", 12)
        del actuals[8]
        result = evaluate(rows, actuals, "2026-02-01", "2026-03-01")
        self.assertEqual(result["matched_hours"], 1)
        self.assertEqual(result["metrics"][1]["first_24h"]["hours"], 1)

    def test_future_model_fails_before_fetch_and_dry_run_can_later_publish(self):
        store = MemoryStore()
        for oid in (1, 2):
            store.write_weather(weather_rows("2026-02-01", oid=oid))
        with tempfile.TemporaryDirectory() as tmp:
            agent = WindAgent(store, bundle(), None, tmp)
            with self.assertRaisesRegex(ValueError, "cutoff"):
                agent.run("2026-01-01")
            dry = agent.run("2026-02-01", persist=False)
            self.assertEqual(len(store.writes), 0)
            self.assertEqual(agent.run("2026-02-01")["run_id"], dry["run_id"])
            self.assertEqual(len(store.writes), 1)

    def test_noaa_index_only_extracts_required_message_ranges(self):
        index = "1:0:d=2026020100:TMP:2 m above ground:24 hour fcst:\n2:10:d=x:UGRD:100 m above ground:x:\n3:20:d=x:VGRD:100 m above ground:x:\n4:30:d=x:TMP:surface:x:"
        self.assertEqual(field_ranges(index), {"temp": (0, 9), "u100": (10, 19), "v100": (20, 29)})

    def test_full_workflow_independent_holdout_and_complete_february(self):
        from backend.app.forecasting.wind_hackathon_workflow import workflow

        start, cutoff = local_time("2025-11-15T18:00"), local_time("2026-01-31T18:00")
        actual_rows = []
        for oid in (1, 2):
            actual_rows += facts(start, int((cutoff - start).total_seconds() / 600), oid=oid, power=0.02)

        class Store(MemoryStore):
            def actuals(self, start, cutoff):
                return [r for r in actual_rows if local_time(start) <= r["timestamp"] < local_time(cutoff)]

        class Source:
            provider = "test"
            weather_model = "test"

            def candidates(self, origin):
                return [origin - pd.Timedelta(hours=8)]

            def fetch(self, objects, issue, **kwargs):
                rows = []
                for obj in objects:
                    rows += weather_rows(
                        issue + pd.Timedelta(hours=8), oid=obj["object_id"], issue=issue, wind=2
                    )
                for row in rows:
                    row["archive_kind"] = "synthetic_test"
                return rows

        with tempfile.TemporaryDirectory() as tmp:
            store = Store()
            report = workflow(
                store,
                Source(),
                training_start=start,
                cutoff=cutoff,
                until="2026-02-28T18:00",
                output_dir=tmp,
                validation_days=3,
            )
            self.assertEqual(report["status"], "complete")
            self.assertEqual(report["february_hours"], 1344)
            self.assertEqual(len(report["completed_origins"]), 29)
            self.assertEqual(report["forecast_rows"], 19488)
            self.assertEqual(len(store.writes), 29)
            self.assertEqual(report["holdout_metrics"]["status"], "scored")
            self.assertEqual(report["february_accuracy"], "not_scored_no_february_actuals_used")
            self.assertTrue((Path(tmp) / "february_hourly_latest.csv").exists())


if __name__ == "__main__":
    unittest.main()
