"""Reproducible backfill -> January holdout -> final fit -> February replay."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from backend.app.forecasting.wind_hackathon import local_time, stamp
from backend.app.forecasting.wind_hackathon_agent import WindAgent, evaluate
from backend.app.forecasting.wind_hackathon_io import load_bundle, train
from backend.app.forecasting.wind_weather_archive import fetch_for_origin, save_json


def fit_or_load(store, source, path, start, cutoff, validation_days):
    if path.exists():
        bundle = load_bundle(path)
        if (
            bundle["training_start"] != stamp(start)
            or bundle["trained_until"] != stamp(cutoff)
            or bundle["provider"] != source.provider
            or bundle["weather_model"] != source.weather_model
        ):
            raise ValueError("Existing model belongs to another workflow; use another output directory")
        return bundle
    train(
        store,
        start=start,
        cutoff=cutoff,
        artifact=path,
        provider=source.provider,
        weather_model=source.weather_model,
        publication_lag_hours=None,
        validation_days=validation_days,
    )
    return load_bundle(path)


def export_rows(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as output:
        for row in rows:
            output.write(json.dumps(row, ensure_ascii=False, allow_nan=False) + "\n")
    temporary.replace(path)


def workflow(store, source, *, training_start, cutoff, until, output_dir, horizon=48, validation_days=30):
    start, cutoff, until = map(local_time, (training_start, cutoff, until))
    if until < cutoff or start >= cutoff - pd.Timedelta(days=validation_days + 38):
        raise ValueError("Need training history, a tuning window and a separate 30-day holdout")
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    objects = store.objects()
    manifest_path = output / "workflow.json"
    manifest = {
        "training_start": stamp(start),
        "first_origin": stamp(cutoff),
        "until": stamp(until),
        "provider": source.provider,
        "weather_model": source.weather_model,
        "horizon_hours": horizon,
        "status": "backfill",
        "completed_origins": [],
    }
    save_json(manifest_path, manifest)
    # Daily source snapshots, plus exact test origins at the chosen launch hour.
    origins = set(pd.date_range(start, cutoff, freq="24h"))
    holdout_start = cutoff - pd.Timedelta(days=30)
    holdout_origins = pd.date_range(holdout_start, cutoff - pd.Timedelta(days=1), freq="24h")
    test_origins = pd.date_range(cutoff, until, freq="24h")
    origins.update(holdout_origins)
    origins.update(test_origins)
    progress_path = output / "weather_progress.json"
    # Reuse validated raw HTTP caches; always upsert into CH (DB may be recreated).
    for n, origin in enumerate(sorted(origins), 1):
        result = fetch_for_origin(store, source, objects, origin, horizon)
        save_json(progress_path, {"done": n, "total": len(origins), "origin": stamp(origin), **result})
    manifest["status"] = "holdout"
    save_json(manifest_path, manifest)
    validation_bundle = fit_or_load(
        store, source, output / "validation_model.joblib", start, holdout_start, validation_days
    )
    validator = WindAgent(store, validation_bundle, None, output / "validation")
    validation_rows = []
    for origin in holdout_origins:
        validation_rows.extend(validator.run(origin, horizon, persist=False)["data"])
    # This holdout was never used to train or tune validation_bundle.
    validation = evaluate(validation_rows, store.actuals(holdout_start, cutoff), holdout_start, cutoff)
    validation["description"] = "Independent pre-test holdout; no weight selection on these targets"
    save_json(output / "holdout_metrics.json", validation)
    export_rows(output / "holdout.jsonl", validation_rows)
    if validation["status"] != "scored":
        raise ValueError("Independent holdout has no complete factual hours")
    bundle = fit_or_load(store, source, output / "model.joblib", start, cutoff, validation_days)
    save_json(
        output / "training_metrics.json",
        {str(oid): model.validation for oid, model in bundle["models"].items()},
    )
    agent = WindAgent(store, bundle, source, output / "replay")
    manifest["status"] = "replay"
    all_rows = []
    for origin in test_origins:
        result = agent.run(origin, horizon)
        all_rows.extend(result["data"])
        manifest["completed_origins"].append(stamp(origin))
        save_json(manifest_path, manifest)
    export_rows(output / "replay.jsonl", all_rows)
    frame = pd.DataFrame(all_rows)
    frame["target"] = frame.timestamp.map(local_time)
    feb_start, feb_end = local_time("2026-02-01"), local_time("2026-03-01")
    hourly = frame[
        (frame.period_type == "hour") & (frame.target >= feb_start) & (frame.target < feb_end)
    ].drop(columns="target")
    hourly.to_csv(output / "february_hourly_all_origins.csv", index=False)
    # Submission convenience: most recent eligible origin for each February hour.
    latest = hourly.sort_values("forecast_origin").drop_duplicates(["object_id", "timestamp"], keep="last")
    latest.to_csv(output / "february_hourly_latest.csv", index=False)
    expected = len(objects) * 28 * 24
    manifest.update(
        {
            "status": "complete" if len(latest) == expected else "failed_coverage",
            "forecast_rows": len(all_rows),
            "february_hours": len(latest),
            "expected_february_hours": expected,
            "february_coverage_complete": len(latest) == expected,
            "archive_kind": sorted(set(frame.weather_archive_kind)),
            "february_accuracy": "not_scored_no_february_actuals_used",
            "holdout_metrics": validation,
        }
    )
    save_json(manifest_path, manifest)
    if len(latest) != expected:
        raise ValueError(f"February hourly coverage incomplete: {len(latest)}/{expected}")
    return manifest
