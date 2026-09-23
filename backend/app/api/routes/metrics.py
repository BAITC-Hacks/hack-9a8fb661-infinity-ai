from fastapi import APIRouter, Depends

from app.api.deps import get_store
from app.schemas.metrics import MetricsResponse
from app.services.export import overall_metrics

router = APIRouter(tags=["metrics"])


@router.get("/metrics", response_model=MetricsResponse)
def metrics(store=Depends(get_store)):
    return overall_metrics(store.latest_forecasts())
