"""FastAPI-приложение. Собранный фронтенд (frontend/dist) раздаётся с того же порта."""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core import auth, config
from app.core.logging import setup_logging

setup_logging()

app = FastAPI(title="Infinity AI — прогноз выработки ВЭС", version="1.0.0",
              docs_url="/api/auth/docs" if not config.APP_PASSWORD else None, openapi_url="/api/auth/openapi.json" if not config.APP_PASSWORD else None)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"],
                   allow_headers=["*"])
OPEN_PATHS = ("/api/auth/", "/api/health")


@app.middleware("http")
async def require_login(request: Request, call_next):
    """Все /api/* кроме входа и health — только с действующей сессией."""
    path = request.url.path
    if auth.enabled() and path.startswith("/api/") and not path.startswith(OPEN_PATHS) \
            and not auth.verify_token(request.cookies.get(auth.COOKIE)):
        return JSONResponse({"detail": "Требуется вход"}, status_code=401)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


app.include_router(api_router)

DIST = config.ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = DIST / path
        return FileResponse(f if path and f.is_file() else DIST / "index.html")
