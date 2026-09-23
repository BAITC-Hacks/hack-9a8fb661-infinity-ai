from pydantic import BaseModel


class MetricRow(BaseModel):
    turbine: str | None = None
    bucket: str | None = None
    issue_date: str | None = None
    n: int
    mae: float
    rmse: float
    mae_base: float | None = None
    skill: float | None = None


class DailyError(BaseModel):
    turbine: str
    issue_date: str
    mae_base: float | None = None
    mae_24: float | None = None
    mae_48: float | None = None


class CurvePoint(BaseModel):
    v: float
    p: float


class PowerCurveResponse(BaseModel):
    turbine: str
    n_hours: int
    curve: list[CurvePoint]
    points: list[CurvePoint]


class MetricsResponse(BaseModel):
    note: str | None = None
    by_turbine_and_horizon: list[MetricRow] = []
    station_by_issue_date: list[MetricRow] = []
    daily: list[DailyError] = []
    coverage: list[dict] = []
