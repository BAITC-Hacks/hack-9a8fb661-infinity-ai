"""FastAPI-приложение. Собранный фронтенд (frontend/dist) раздаётся с того же порта."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core import config
from app.core.logging import setup_logging

setup_logging()

app = FastAPI(title="Infinity AI — прогноз выработки ВЭС", version="1.0.0",
              docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"],
                   allow_headers=["*"])
app.include_router(api_router)

DIST = config.ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = DIST / path
        return FileResponse(f if path and f.is_file() else DIST / "index.html")
