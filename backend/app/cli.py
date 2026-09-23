"""CLI: python -m app.cli {fetch-weather|backtest|forecast|export}"""
import argparse
import logging

from app.core.logging import setup_logging

import pandas as pd

from app import db
from app.core import config
from app.services.agent import ForecastAgent
from app.services.export import export_all
from app.ml.weather import load_weather


def main(argv=None):
    p = argparse.ArgumentParser(prog="app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("fetch-weather", help="скачать архив прогнозов в data/cache")
    b = sub.add_parser("backtest", help="январский бэктест + февральский тестовый период")
    b.add_argument("--start", default=config.BACKTEST_ISSUES[0])
    b.add_argument("--end", default=config.FORECAST_ISSUES[1])
    b.add_argument("--force", action="store_true", help="пересчитать даже без изменений")
    f = sub.add_parser("forecast", help="один выпуск прогноза")
    f.add_argument("issue_date")
    f.add_argument("--force", action="store_true")
    sub.add_parser("export", help="outputs/forecasts.csv и metrics.json из БД")
    sub.add_parser("ensure", help="бэктест, только если хранилище пустое (для docker)")
    sub.add_parser("train-embeddings", help="обучить векторный индекс базы знаний агента")
    a = p.parse_args(argv)

    setup_logging()
    print(f"storage: {db.backend_name()}")
    if a.cmd == "fetch-weather":
        end = pd.Timestamp(config.FORECAST_ISSUES[1]) + pd.Timedelta(days=2)
        w = load_weather("2023-03-01", end)
        print(f"weather rows: {len(w)}, {w['time'].min()} .. {w['time'].max()}")
    elif a.cmd == "backtest":
        runs = ForecastAgent().run_range(a.start, a.end, force=a.force)
        print(f"issues done: {len(runs)}")
        m = export_all()
        for r in m.get("by_turbine_and_horizon", []):
            print(r)
    elif a.cmd == "forecast":
        r = ForecastAgent().run_issue(a.issue_date, force=a.force)
        print(r["summary"])
        export_all()
    elif a.cmd == "ensure":
        if db.get_store().runs():
            print("storage already has forecasts — skip backtest")
        else:
            main(["backtest"])
        main(["train-embeddings"])
    elif a.cmd == "train-embeddings":
        from app.services.knowledge import get_index
        print(get_index().train())
    elif a.cmd == "export":
        export_all()


if __name__ == "__main__":
    main()
