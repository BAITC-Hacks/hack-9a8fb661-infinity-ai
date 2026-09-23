"""Общие зависимости роутеров: хранилище, агент-синглтон, валидация параметров."""
import threading

from fastapi import HTTPException, Query

from app import db
from app.db.base import Store
from app.services.agent import ForecastAgent
from app.services.chat import validate_date

_agent: ForecastAgent | None = None
_agent_init = threading.Lock()
agent_lock = threading.Lock()   # один расчёт за раз: модель в памяти общая


def get_store() -> Store:
    return db.get_store()


def get_agent() -> ForecastAgent:
    global _agent
    with _agent_init:
        if _agent is None:
            _agent = ForecastAgent()
    return _agent


def issue_date_param(issue_date: str = Query(..., description="YYYY-MM-DD")) -> str:
    try:
        return validate_date(issue_date)
    except ValueError as e:
        raise HTTPException(422, f"issue_date: {e}")


def optional_issue_date(issue_date: str | None = Query(None)) -> str | None:
    return issue_date_param(issue_date) if issue_date else None
