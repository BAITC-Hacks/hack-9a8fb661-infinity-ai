from typing import Literal

from pydantic import BaseModel

TurbineId = Literal["STATION", "T1", "T2"]


class Run(BaseModel):
    id: int
    created_at: str
    issue_date: str
    mode: Literal["backtest", "forecast"]
    status: Literal["ok", "low_confidence", "failed"]
    model_trained_until: str | None = None
    weather_signature: float | None = None
    summary: str | None = None


class ForecastRow(BaseModel):
    issue_date: str
    target_time: str
    lead_hours: int
    turbine: str
    p_hat: float
    p_curve: float | None = None
    v_eq: float | None = None
    actual: float | None = None
    baseline: float | None = None


class ForecastResponse(BaseModel):
    run: Run
    rows: list[ForecastRow]


class TimelinePoint(BaseModel):
    issue_date: str
    target_time: str
    lead_hours: int
    p_hat: float
    actual: float | None = None
