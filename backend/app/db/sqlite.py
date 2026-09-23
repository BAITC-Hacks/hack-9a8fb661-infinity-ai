"""SQLite-хранилище: файл data/app.db, сервер не нужен (запасной режим)."""
import sqlite3

import pandas as pd

from app.core import config
from app.db.base import FC_COLS, METRIC_COLS, Store, _j, _none, new_id, now_iso

SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, created_at TEXT, issue_date TEXT,
  mode TEXT, status TEXT, model_trained_until TEXT, weather_signature REAL, summary TEXT);
CREATE TABLE IF NOT EXISTS forecasts (run_id INTEGER, issue_date TEXT, target_time TEXT,
  lead_hours INTEGER, turbine TEXT, p_hat REAL, p_curve REAL, v_eq REAL, actual REAL,
  baseline REAL, PRIMARY KEY (run_id, target_time, turbine));
CREATE INDEX IF NOT EXISTS ix_fc_issue ON forecasts(issue_date, turbine);
CREATE TABLE IF NOT EXISTS metrics (run_id INTEGER, issue_date TEXT, turbine TEXT, bucket TEXT,
  n INTEGER, mae REAL, rmse REAL, mae_base REAL, skill REAL);
CREATE TABLE IF NOT EXISTS agent_log (id INTEGER PRIMARY KEY, ts TEXT, session TEXT,
  issue_date TEXT, tool TEXT, params TEXT, result TEXT, reason TEXT);
CREATE INDEX IF NOT EXISTS ix_log_issue ON agent_log(issue_date);
CREATE TABLE IF NOT EXISTS llm_cache (key TEXT PRIMARY KEY, model TEXT, response TEXT,
  prompt_tokens INTEGER, completion_tokens INTEGER, created_at TEXT);
"""


class SqliteStore(Store):
    def __init__(self, path=None):
        self.path = path or config.DB_PATH

    def _con(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(self.path, timeout=30)
        con.row_factory = sqlite3.Row
        return con

    def _exec(self, sql, params=(), many=False):
        con = self._con()
        try:
            (con.executemany if many else con.execute)(sql, params)
            con.commit()
        finally:
            con.close()

    def _rows(self, sql, params=()):
        con = self._con()
        try:
            return [dict(r) for r in con.execute(sql, params).fetchall()]
        finally:
            con.close()

    def init(self):
        con = self._con()
        try:
            con.execute("PRAGMA journal_mode = WAL")
            con.executescript(SQLITE_SCHEMA)
        finally:
            con.close()

    def create_run(self, issue_date, mode, status, trained_until, signature, summary):
        rid = new_id()
        self._exec("INSERT INTO runs VALUES (?,?,?,?,?,?,?,?)",
                   (rid, now_iso(), issue_date, mode, status, trained_until, signature, summary))
        return rid

    def insert_forecasts(self, run_id, rows):
        self._exec(f"INSERT INTO forecasts VALUES ({','.join('?' * len(FC_COLS))})",
                   [[run_id] + [_none(r[c]) for c in FC_COLS[1:]] for r in rows], many=True)

    def insert_metrics(self, run_id, issue_date, rows):
        self._exec(f"INSERT INTO metrics VALUES ({','.join('?' * len(METRIC_COLS))})",
                   [[run_id, issue_date] + [_none(r[c]) for c in METRIC_COLS[2:]] for r in rows],
                   many=True)

    def log_step(self, session, issue_date, tool, params=None, result=None, reason=None):
        self._exec("INSERT INTO agent_log VALUES (?,?,?,?,?,?,?,?)",
                   (new_id(), now_iso(), session, issue_date, tool, _j(params), _j(result),
                    reason))

    def latest_run(self, issue_date):
        r = self._rows("SELECT * FROM runs WHERE issue_date=? ORDER BY id DESC LIMIT 1",
                       (issue_date,))
        return r[0] if r else None

    def previous_run(self, issue_date):
        r = self._rows("SELECT * FROM runs WHERE issue_date<? ORDER BY issue_date DESC, id DESC"
                       " LIMIT 1", (issue_date,))
        return r[0] if r else None

    def runs(self):
        return self._rows("SELECT r.* FROM runs r JOIN (SELECT MAX(id) id FROM runs GROUP BY"
                          " issue_date) l ON r.id=l.id ORDER BY r.issue_date")

    def forecasts(self, run_id, turbine=None):
        sql, p = "SELECT * FROM forecasts WHERE run_id=?", [run_id]
        if turbine:
            sql, p = sql + " AND turbine=?", p + [turbine]
        return pd.DataFrame(self._rows(sql + " ORDER BY turbine, target_time", p),
                            columns=FC_COLS)

    def latest_forecasts(self, turbine=None):
        sql = ("SELECT * FROM forecasts WHERE run_id IN (SELECT MAX(id) FROM runs GROUP BY"
               " issue_date)")
        p = []
        if turbine:
            sql, p = sql + " AND turbine=?", [turbine]
        return pd.DataFrame(self._rows(sql + " ORDER BY issue_date, turbine, target_time", p),
                            columns=FC_COLS)

    def agent_log(self, issue_date=None, limit=200):
        if issue_date:
            return self._rows("SELECT * FROM agent_log WHERE issue_date=? ORDER BY id DESC"
                              " LIMIT ?", (issue_date, limit))[::-1]
        return self._rows("SELECT * FROM agent_log ORDER BY id DESC LIMIT ?", (limit,))[::-1]

    def cache_get(self, key):
        r = self._rows("SELECT response FROM llm_cache WHERE key=?", (key,))
        return r[0]["response"] if r else None

    def cache_put(self, key, model, response, prompt_tokens, completion_tokens):
        self._exec("INSERT OR REPLACE INTO llm_cache VALUES (?,?,?,?,?,?)",
                   (key, model, response, prompt_tokens, completion_tokens, now_iso()))

    def llm_usage(self):
        r = self._rows("SELECT COUNT(*) calls, COALESCE(SUM(prompt_tokens),0) prompt_tokens,"
                       " COALESCE(SUM(completion_tokens),0) completion_tokens FROM llm_cache")
        return r[0]


