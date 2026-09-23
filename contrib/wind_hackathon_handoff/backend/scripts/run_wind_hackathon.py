"""python -m backend.scripts.run_wind_hackathon --help"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from pathlib import Path

import pandas as pd

from backend.app.forecasting.wind_hackathon import local_time
from backend.app.forecasting.wind_hackathon_io import WindStore, forecast, load_bundle, train


def source_options(command):
    command.add_argument("--source", choices=("open-meteo", "noaa-gfs"), default="open-meteo")
    command.add_argument("--cache-dir", type=Path, default=Path("outputs/wind_forecast/weather_cache"))
    command.add_argument(
        "--allow-hindcast",
        action="store_true",
        help="Explicit provisional Open-Meteo experiment; NOT proof of as-issued compliance",
    )
    command.add_argument(
        "--weather-lag-hours",
        type=float,
        default=8,
        help="Open-Meteo availability assumption; NOAA reads original Last-Modified",
    )


def weather_source(args):
    if args.source == "noaa-gfs":
        from backend.app.forecasting.wind_noaa_archive import NoaaGfsArchive

        return NoaaGfsArchive(args.cache_dir)
    from backend.app.forecasting.wind_weather_archive import OpenMeteoArchive

    return OpenMeteoArchive(
        args.cache_dir, lag_hours=args.weather_lag_hours, allow_hindcast=args.allow_hindcast
    )


def extended_command(args, parser, store):
    from backend.app.forecasting.wind_hackathon_agent import WindAgent, evaluate
    from backend.app.forecasting.wind_hackathon_workflow import workflow
    from backend.app.forecasting.wind_weather_archive import fetch_for_origin, save_json

    if args.command == "check":
        required = {
            "wind_objects": {"object_id", "latitude", "longitude", "rated_power_mw"},
            "wind_actuals": {"object_id", "timestamp", "avg_wind", "avg_tmp", "power_normalized"},
            "wind_weather_forecasts": {
                "issued_at",
                "available_at",
                "valid_at",
                "source_sha256",
                "archive_kind",
            },
            "wind_power_forecasts": {"timestamp", "period_type", "weather_available_at", "input_sha256"},
        }
        for table, columns in required.items():
            found = {r["name"] for r in store.client.query_json_each_row(f"DESCRIBE TABLE {table}")}
            if columns - found:
                raise ValueError(f"{table}: missing {columns - found}; apply DDL/additive upgrade")
        print(
            json.dumps(
                {
                    "status": "ready",
                    "objects": store.objects(),
                    "facts": store.client.query_json_each_row(
                        "SELECT object_id, count() AS rows, min(timestamp) AS first, max(timestamp) AS last FROM wind_actuals FINAL GROUP BY object_id"
                    ),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    elif args.command == "evaluate":
        rows = [
            json.loads(line)
            for line in args.predictions.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        result = evaluate(rows, store.actuals(args.start, args.until), args.start, args.until)
        save_json(args.output, result)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "fetch-weather":
        if args.step_hours <= 0 or local_time(args.until) < local_time(args.start):
            parser.error("Positive step and until >= start required")
        source = weather_source(args)
        objects = store.objects()
        for origin in pd.date_range(
            local_time(args.start), local_time(args.until), freq=f"{args.step_hours}h"
        ):
            print(
                json.dumps(
                    fetch_for_origin(store, source, objects, origin, args.horizon_hours, refresh=args.refresh)
                )
            )
    elif args.command == "workflow":
        result = workflow(
            store,
            weather_source(args),
            training_start=args.training_start,
            cutoff=args.cutoff,
            until=args.until,
            output_dir=args.output_dir,
            horizon=args.horizon_hours,
            validation_days=args.validation_days,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "agent":
        if not args.watch and not args.origin:
            parser.error("agent needs --origin or --watch")
        if args.poll_seconds < 10 or args.cycles < 0:
            parser.error("poll-seconds must be >=10 and cycles >=0")
        source = weather_source(args)
        cycle = 0
        while True:
            # Reload on each cycle to detect a replacement/newly deployed model.
            agent = WindAgent(store, load_bundle(args.artifact), source, args.output_dir)
            origin = local_time(args.origin) if args.origin else pd.Timestamp.now(tz="UTC").floor("h")
            try:
                result = agent.run(origin, args.horizon_hours, persist=not args.dry_run, refresh=args.refresh)
                print(json.dumps({k: v for k, v in result.items() if k != "data"}, ensure_ascii=False))
            except Exception as exc:
                agent.event("cycle_failed", reason=str(exc), error_type=type(exc).__name__)
                if not args.watch:
                    raise
            cycle += 1
            if not args.watch or (args.cycles and cycle >= args.cycles):
                break
            time.sleep(args.poll_seconds)


def main():
    parser = argparse.ArgumentParser(
        description="Nurly wind forecasting and autonomous archive/replay workflow via ClickHouse"
    )
    parser.add_argument("--env-file", type=Path, default=Path(__file__).resolve().parents[2] / ".env.wind")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("check", help="Read-only ClickHouse schema and fact availability check")
    fetching = sub.add_parser("fetch-weather")
    source_options(fetching)
    fetching.add_argument("--start", required=True, help="First virtual forecast origin")
    fetching.add_argument("--until", required=True)
    fetching.add_argument("--step-hours", type=int, default=24)
    fetching.add_argument("--horizon-hours", type=int, choices=(24, 48), default=48)
    fetching.add_argument("--refresh", action="store_true")
    agent = sub.add_parser("agent")
    source_options(agent)
    agent.add_argument("--artifact", type=Path, required=True)
    agent.add_argument("--origin", help="Fixed replay clock; omit with --watch for wall clock")
    agent.add_argument("--horizon-hours", type=int, choices=(24, 48), default=48)
    agent.add_argument("--output-dir", type=Path, default=Path("outputs/wind_forecast/agent"))
    agent.add_argument("--watch", action="store_true")
    agent.add_argument("--poll-seconds", type=int, default=900)
    agent.add_argument("--cycles", type=int, default=0, help="0 = continuous watch")
    agent.add_argument("--refresh", action="store_true", help="Recheck even previously cached weather issues")
    agent.add_argument(
        "--dry-run", action="store_true", help="Save weather/cache, but do not publish power to ClickHouse"
    )
    pipeline = sub.add_parser("workflow")
    source_options(pipeline)
    pipeline.add_argument("--training-start", default="2024-03-15T18:00:00+05:00")
    pipeline.add_argument("--cutoff", default="2026-01-31T18:00:00+05:00")
    pipeline.add_argument("--until", default="2026-02-28T18:00:00+05:00")
    pipeline.add_argument("--horizon-hours", type=int, choices=(24, 48), default=48)
    pipeline.add_argument("--validation-days", type=int, default=30)
    pipeline.add_argument("--output-dir", type=Path, default=Path("outputs/wind_forecast/workflow"))
    evaluation = sub.add_parser("evaluate", help="Score stored predictions only after actuals arrive")
    evaluation.add_argument("--predictions", type=Path, required=True)
    evaluation.add_argument("--start", default="2026-02-01T00:00:00+05:00")
    evaluation.add_argument("--until", default="2026-03-01T00:00:00+05:00", help="Exclusive end")
    evaluation.add_argument("--output", type=Path, default=Path("outputs/wind_forecast/evaluation.json"))
    training = sub.add_parser("train")
    training.add_argument("--start", default="2024-03-15T00:00:00+05:00")
    training.add_argument(
        "--cutoff", required=True, help="Exclusive fact/training cutoff; no later than first replay"
    )
    training.add_argument("--provider", default="open-meteo")
    training.add_argument("--weather-model", default="ecmwf_ifs")
    training.add_argument(
        "--publication-lag-hours",
        type=float,
        help="Explicit assumption ONLY for weather with unknown available_at",
    )
    training.add_argument("--validation-days", type=int, default=30)
    for command in (training, sub.add_parser("predict"), sub.add_parser("replay")):
        command.add_argument("--artifact", type=Path, required=True)
        if command is not training:
            command.add_argument("--origin", required=True, help="Whole hour, ISO format; naive = UTC+5")
            command.add_argument("--horizon-hours", type=int, choices=(24, 48), default=48)
            command.add_argument("--dry-run", action="store_true", help="Read CH, calculate, do not insert")
            command.add_argument("--output", type=Path, help="Optional JSONL with complete forecast rows")
        if command.prog.endswith("replay"):
            command.add_argument("--until", required=True, help="Inclusive last virtual origin")
            command.add_argument("--step-hours", type=int, default=24)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    from dotenv import load_dotenv

    load_dotenv(args.env_file, override=False)
    # Import lazily so help and numerical tests work without application services.
    from backend.app.clickhouse import ClickHouseClient

    # Isolated settings: never accidentally train/write in the portal's database.
    client = ClickHouseClient(
        url=os.getenv("WIND_CLICKHOUSE_URL", "http://localhost:8123"),
        database=os.getenv("WIND_CLICKHOUSE_DATABASE", "wind"),
        username=os.getenv("WIND_CLICKHOUSE_USERNAME", "wind"),
        password=os.getenv("WIND_CLICKHOUSE_PASSWORD", ""),
        timeout=int(os.getenv("WIND_CLICKHOUSE_TIMEOUT_SECONDS", "120")),
    )
    store = WindStore(client)
    if args.command in ("check", "fetch-weather", "workflow", "agent", "evaluate"):
        if args.command in ("workflow", "agent"):
            from filelock import FileLock

            args.output_dir.mkdir(parents=True, exist_ok=True)
            with FileLock(str(args.output_dir / ".controller.lock"), timeout=0):
                extended_command(args, parser, store)
        else:
            extended_command(args, parser, store)
        return
    if args.command == "train":
        result = train(
            store,
            start=args.start,
            cutoff=args.cutoff,
            artifact=args.artifact,
            provider=args.provider,
            weather_model=args.weather_model,
            publication_lag_hours=args.publication_lag_hours,
            validation_days=args.validation_days,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    bundle = load_bundle(args.artifact)
    origins = [local_time(args.origin)]
    if args.command == "replay":
        if args.step_hours <= 0 or local_time(args.until) < origins[0]:
            parser.error("Positive step and until >= origin are required")
        origins = pd.date_range(origins[0], local_time(args.until), freq=f"{args.step_hours}h")
    output = None
    try:
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            output = args.output.open("x", encoding="utf-8")
        for origin in origins:
            result = forecast(
                store, bundle, origin=origin, horizon_hours=args.horizon_hours, persist=not args.dry_run
            )
            rows = result.pop("data")
            if output:
                for row in rows:
                    output.write(json.dumps(row, ensure_ascii=False) + "\n")
                output.flush()
            print(json.dumps(result, ensure_ascii=False))
    finally:
        if output:
            output.close()


if __name__ == "__main__":
    main()
