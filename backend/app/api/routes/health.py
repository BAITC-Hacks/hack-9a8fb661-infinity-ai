from fastapi import APIRouter, Depends

from app import db
from app.api.deps import get_store
from app.core import config
from app.schemas.agent import Health, LlmUsage
from app.services import llm

router = APIRouter(tags=["system"])


@router.get("/health", response_model=Health)
def health():
    return Health(status="ok", storage=db.backend_name(), llm=llm.provider(),
                  weather_offline=config.WEATHER_OFFLINE)


@router.get("/usage", response_model=LlmUsage)
def usage(store=Depends(get_store)):
    return store.llm_usage()
