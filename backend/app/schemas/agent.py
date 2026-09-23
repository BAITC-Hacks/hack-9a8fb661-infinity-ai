from typing import Any

from pydantic import BaseModel


class AgentLogEntry(BaseModel):
    id: int
    ts: str
    session: str
    issue_date: str | None = None
    tool: str
    params: Any = None
    result: Any = None
    reason: str | None = None


class Health(BaseModel):
    status: str
    storage: str
    llm: str
    weather_offline: bool


class LlmUsage(BaseModel):
    calls: int
    prompt_tokens: int | None = 0
    completion_tokens: int | None = 0
