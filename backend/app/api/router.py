from fastapi import APIRouter

from app.api.routes import agent, forecasts, health, metrics

api_router = APIRouter(prefix="/api")
for r in (health.router, forecasts.router, metrics.router, agent.router):
    api_router.include_router(r)
