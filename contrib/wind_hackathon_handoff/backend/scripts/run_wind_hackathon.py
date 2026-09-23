"""python -m backend.scripts.run_wind_hackathon --help"""

from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path

import pandas as pd

from backend.app.forecasting.wind_hackathon import local_time
from backend.app.forecasting.wind_hackathon_io import WindStore, forecast, load_bundle, train


def main():
    parser = argparse.ArgumentParser(description="Nurly wind forecast: train, predict, replay via ClickHouse")
    parser.add_argument("--env-file", type=Path, default=Path(__file__).resolve().parents[2] / ".env.wind")
    sub = parser.add_subparsers(dest="command", required=True)
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
