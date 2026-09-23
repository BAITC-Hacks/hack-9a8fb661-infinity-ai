"""ClickHouse-хранилище (основное, docker compose)."""
import threading
from datetime import datetime, timezone

import pandas as pd

from app.core import config
from app.db.base import FC_COLS, LOG_COLS, METRIC_COLS, RUN_COLS, Store, _j, _none, new_id

# Справочник объектов — DDL дата-инженера без изменений.
WIND_OBJECTS_DDL = """CREATE TABLE IF NOT EXISTS wind_objects
(
    object_id UInt32,
    name String,
    latitude Float64,
    longitude Float64,
    updated_at DateTime64(3, 'Etc/GMT-5')
        DEFAULT now64(3, 'Etc/GMT-5')
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY object_id"""

CH_SCHEMA = [
    WIND_OBJECTS_DDL,
    """CREATE TABLE IF NOT EXISTS runs (id UInt64, created_at DateTime('UTC'), issue_date Date,
       mode LowCardinality(String), status LowCardinality(String), model_trained_until String,
       weather_signature Float64, summary String) ENGINE = MergeTree ORDER BY (issue_date, id)""",
    """CREATE TABLE IF NOT EXISTS forecasts (run_id UInt64, issue_date Date,
       target_time DateTime('UTC'), lead_hours UInt8, turbine LowCardinality(String),
       p_hat Float32, p_curve Nullable(Float32), v_eq Nullable(Float32),
       actual Nullable(Float32), baseline Nullable(Float32))
       ENGINE = MergeTree PARTITION BY toYYYYMM(issue_date)
       ORDER BY (issue_date, turbine, run_id, target_time)""",
    """CREATE TABLE IF NOT EXISTS metrics (run_id UInt64, issue_date Date,
       turbine LowCardinality(String), bucket LowCardinality(String), n UInt32, mae Float64,
       rmse Float64, mae_base Nullable(Float64), skill Nullable(Float64))
       ENGINE = MergeTree ORDER BY (issue_date, turbine, run_id)""",
    """CREATE TABLE IF NOT EXISTS agent_log (id UInt64, ts DateTime('UTC'), session String,
       issue_date Nullable(Date), tool LowCardinality(String), params Nullable(String),
       result Nullable(String), reason Nullable(String)) ENGINE = MergeTree ORDER BY id""",
    """CREATE TABLE IF NOT EXISTS llm_cache (key String, model String, response String,
       prompt_tokens UInt32, completion_tokens UInt32, created_at DateTime('UTC'))
       ENGINE = ReplacingMergeTree(created_at) ORDER BY key""",
]


def _d(s):
    return pd.Timestamp(s).date() if s else None


def _dt(s):
    return pd.Timestamp(s).tz_convert("UTC").to_pydatetime() if pd.Timestamp(s).tzinfo \
        else pd.Timestamp(s).tz_localize("UTC").to_pydatetime()


class ClickHouseStore(Store):
    def __init__(self):
        import clickhouse_connect
        self._local = threading.local()
        self._factory = lambda: clickhouse_connect.get_client(
            host=config.CLICKHOUSE_HOST, port=config.CLICKHOUSE_PORT,
            username=config.CLICKHOUSE_USER, password=config.CLICKHOUSE_PASSWORD,
            database=config.CLICKHOUSE_DB, connect_timeout=5)
        self.cli.command("SELECT 1")

    @property
    def cli(self):
        # клиент clickhouse-connect не потокобезопасен — по одному на поток
        if not hasattr(self._local, "c"):
            self._local.c = self._factory()
        return self._local.c

    def _rows(self, sql, params=None):
        res = self.cli.query(sql, parameters=params or {})
        out = []
        for row in res.result_rows:
            d = dict(zip(res.column_names, row))
            for k, v in d.items():
                if hasattr(v, "isoformat"):
                    d[k] = v.strftime("%Y-%m-%dT%H:%M:%SZ") if hasattr(v, "hour") \
                        else v.isoformat()
            out.append(d)
        return out

    def init(self):
        for ddl in CH_SCHEMA:
            self.cli.command(ddl)
        if not self.cli.query("SELECT count() FROM wind_objects").result_rows[0][0]:
            self.cli.insert("wind_objects", [[o.object_id, o.name, o.lat, o.lon]
                                             for o in config.TURBINES],
                            column_names=["object_id", "name", "latitude", "longitude"])

    def objects(self):
        return self._rows("SELECT object_id, name, latitude, longitude FROM wind_objects FINAL"
                          " ORDER BY object_id")

    def create_run(self, issue_date, mode, status, trained_until, signature, summary):
        rid = new_id()
        self.cli.insert("runs", [[rid, datetime.now(timezone.utc), _d(issue_date), mode, status,
                                  trained_until or "", float(signature), summary or ""]],
                        column_names=RUN_COLS)
        return rid

    def insert_forecasts(self, run_id, rows):
        data = [[run_id, _d(r["issue_date"]), _dt(r["target_time"]), int(r["lead_hours"]),
                 r["turbine"]] + [_none(r[c]) for c in FC_COLS[5:]] for r in rows]
        self.cli.insert("forecasts", data, column_names=FC_COLS)

    def insert_metrics(self, run_id, issue_date, rows):
        data = [[run_id, _d(issue_date), r["turbine"], r["bucket"], int(r["n"]), r["mae"],
                 r["rmse"], _none(r["mae_base"]), _none(r["skill"])] for r in rows]
        self.cli.insert("metrics", data, column_names=METRIC_COLS)

    def log_step(self, session, issue_date, tool, params=None, result=None, reason=None):
        self.cli.insert("agent_log", [[new_id(), datetime.now(timezone.utc), session,
                                       _d(issue_date), tool, _j(params), _j(result), reason]],
                        column_names=LOG_COLS)

    def latest_run(self, issue_date):
        r = self._rows("SELECT * FROM runs WHERE issue_date={d:Date} ORDER BY id DESC LIMIT 1",
                       {"d": issue_date})
        return r[0] if r else None

    def previous_run(self, issue_date):
        r = self._rows("SELECT * FROM runs WHERE issue_date<{d:Date} ORDER BY issue_date DESC,"
                       " id DESC LIMIT 1", {"d": issue_date})
        return r[0] if r else None

    def runs(self):
        return self._rows("SELECT * FROM runs WHERE id IN (SELECT max(id) FROM runs GROUP BY"
                          " issue_date) ORDER BY issue_date")

    def forecasts(self, run_id, turbine=None):
        sql, p = "SELECT * FROM forecasts WHERE run_id={r:UInt64}", {"r": run_id}
        if turbine:
            sql, p = sql + " AND turbine={t:String}", {**p, "t": turbine}
        return pd.DataFrame(self._rows(sql + " ORDER BY turbine, target_time", p),
                            columns=FC_COLS)

    def latest_forecasts(self, turbine=None):
        sql = ("SELECT * FROM forecasts WHERE run_id IN (SELECT max(id) FROM runs GROUP BY"
               " issue_date)")
        p = {}
        if turbine:
            sql, p = sql + " AND turbine={t:String}", {"t": turbine}
        return pd.DataFrame(self._rows(sql + " ORDER BY issue_date, turbine, target_time", p),
                            columns=FC_COLS)

    def agent_log(self, issue_date=None, limit=200):
        if issue_date:
            r = self._rows("SELECT * FROM agent_log WHERE issue_date={d:Date} ORDER BY id DESC"
                           " LIMIT {n:UInt32}", {"d": issue_date, "n": limit})
        else:
            r = self._rows("SELECT * FROM agent_log ORDER BY id DESC LIMIT {n:UInt32}",
                           {"n": limit})
        return r[::-1]

    def cache_get(self, key):
        r = self._rows("SELECT response FROM llm_cache FINAL WHERE key={k:String}", {"k": key})
        return r[0]["response"] if r else None

    def cache_put(self, key, model, response, prompt_tokens, completion_tokens):
        self.cli.insert("llm_cache", [[key, model, response, int(prompt_tokens or 0),
                                       int(completion_tokens or 0), datetime.now(timezone.utc)]],
                        column_names=["key", "model", "response", "prompt_tokens",
                                      "completion_tokens", "created_at"])

    def llm_usage(self):
        return self._rows("SELECT count() calls, sum(prompt_tokens) prompt_tokens,"
                          " sum(completion_tokens) completion_tokens FROM llm_cache FINAL")[0]


