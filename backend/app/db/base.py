"""Хранилище: ClickHouse (основное, docker compose) или SQLite (запасное, без сервера).

Выбор: DB_BACKEND=clickhouse|sqlite. Агент, API и экспорт работают только через
методы Store — SQL конкретной СУБД живёт в этом модуле.
"""
import json
import threading
import time
from datetime import datetime, timezone

import pandas as pd

FC_COLS = ["run_id", "issue_date", "target_time", "lead_hours", "turbine", "p_hat", "p_curve",
           "v_eq", "actual", "baseline"]
METRIC_COLS = ["run_id", "issue_date", "turbine", "bucket", "n", "mae", "rmse", "mae_base",
               "skill"]
RUN_COLS = ["id", "created_at", "issue_date", "mode", "status", "model_trained_until",
            "weather_signature", "summary"]
LOG_COLS = ["id", "ts", "session", "issue_date", "tool", "params", "result", "reason"]

_id_lock = threading.Lock()
_last_id = 0


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> int:
    """Монотонный id на основе времени (в ClickHouse нет автоинкремента)."""
    global _last_id
    with _id_lock:
        _last_id = max(_last_id + 1, time.time_ns() // 1000)
        return _last_id


def _j(x):
    return json.dumps(x, ensure_ascii=False, default=str) if x is not None else None


def _none(v):
    return None if v is None or (isinstance(v, float) and v != v) else v


class Store:
    """Общий интерфейс. Все даты — строки ISO, чтобы бэкенды были взаимозаменяемы."""

    def init(self): ...
    def create_run(self, issue_date, mode, status, trained_until, signature, summary) -> int: ...
    def insert_forecasts(self, run_id, rows): ...
    def insert_metrics(self, run_id, issue_date, rows): ...
    def log_step(self, session, issue_date, tool, params=None, result=None, reason=None): ...
    def latest_run(self, issue_date) -> dict | None: ...
    def previous_run(self, issue_date) -> dict | None: ...
    def runs(self) -> list[dict]: ...
    def forecasts(self, run_id, turbine=None) -> pd.DataFrame: ...
    def latest_forecasts(self, turbine=None) -> pd.DataFrame: ...
    def agent_log(self, issue_date=None, limit=200) -> list[dict]: ...
    def cache_get(self, key) -> str | None: ...
    def cache_put(self, key, model, response, prompt_tokens, completion_tokens): ...
    def llm_usage(self) -> dict: ...


