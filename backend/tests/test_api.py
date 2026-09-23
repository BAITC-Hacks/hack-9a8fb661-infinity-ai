import json

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.main import app
from app.services.agent import ForecastAgent


@pytest.fixture(scope="module")
def client(forecaster):
    deps._agent = ForecastAgent(forecaster)
    return TestClient(app)


def test_health(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and r["llm"] == "mock" and r["storage"] == "sqlite"


def test_run_then_read_forecast(client):
    run = client.post("/api/run", params={"issue_date": "2026-02-10", "force": True})
    assert run.status_code == 200, run.text
    assert run.json()["mode"] == "forecast"
    fc = client.get("/api/forecast", params={"issue_date": "2026-02-10", "turbine": "T1"}).json()
    assert len(fc["rows"]) == 48
    log = client.get("/api/log", params={"issue_date": "2026-02-10"}).json()
    tools = {e["tool"] for e in log}
    assert {"fetch_forecast", "prepare_features", "predict", "analyze", "report"} <= tools


def test_rerun_without_changes_is_skipped(client):
    client.post("/api/run", params={"issue_date": "2026-02-11"})
    before = client.get("/api/issues").json()
    client.post("/api/run", params={"issue_date": "2026-02-11"})
    assert client.get("/api/issues").json() == before
    reasons = [e["reason"] for e in client.get("/api/log", params={"issue_date": "2026-02-11"}).json()]
    assert any(r and "не изменились" in r for r in reasons)


@pytest.mark.parametrize("params", [{"issue_date": "2030-01-01"}, {"issue_date": "abc"},
                                    {"issue_date": "2026-02-10", "turbine": "T9"}])
def test_input_validation(client, params):
    assert client.get("/api/forecast", params=params).status_code == 422


def test_agent_chat_stream_mock(client):
    body = client.get("/api/agent", params={"q": "Какое качество модели?"}).text
    events = [json.loads(line[6:]) for line in body.splitlines() if line.startswith("data: ")]
    types = [e["type"] for e in events]
    assert "tool_call" in types and "answer" in types and types[-1] == "done"


def test_objects_directory(client):
    objs = client.get("/api/objects").json()
    assert [o["object_id"] for o in objs] == [1, 2]
