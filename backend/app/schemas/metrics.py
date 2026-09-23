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


class MetricsResponse(BaseModel):
    note: str | None = None
    by_turbine_and_horizon: list[MetricRow] = []
    station_by_issue_date: list[MetricRow] = []
