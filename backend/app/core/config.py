"""Настройки из окружения (.env). Секреты — только через переменные окружения."""
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Turbine:
    id: str
    object_id: int      # wind_objects.object_id (справочник дата-инженера)
    name: str
    lat: float
    lon: float
    raw_file: str
    rated_power_mw: float = 2.5
    tower_height_m: float = 80
    rotor_diameter_m: float = 109
    model: str = "Goldwind GW109/2500"


# Паспорт — справочник wind_objects дата-инженера (источник: samruk-green.kz, ВЭС «Нурлы»)
OBJECTS_SOURCE_URL = "https://samruk-green.kz/index.php/ru/projects/1047-20210219-133650"
TURBINES = (
    Turbine("T1", 1, "Нурлы — турбина 1", 43.645138889, 78.535611111, "turbine1.csv"),
    Turbine("T2", 2, "Нурлы — турбина 2", 43.643194444, 78.538833333, "turbine2.csv"),
)
ACTUALS_FILE = "wind_actuals.csv"   # выгрузка wind_actuals дата-инженера (все объекты)
GAPS_FILE = "wind_actuals_gaps.csv"  # отчёт о пропусках в wind_actuals (дата-инженер)
# Обе турбины в одной ячейке сетки Open-Meteo — погодный ряд один на станцию.
SITE_LAT = round(sum(t.lat for t in TURBINES) / len(TURBINES), 5)
SITE_LON = round(sum(t.lon for t in TURBINES) / len(TURBINES), 5)

DATA_DIR = Path(os.getenv("DATA_DIR", ROOT / "data"))
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
CACHE_DIR = DATA_DIR / "cache"
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", ROOT / "outputs"))
DB_PATH = Path(os.getenv("DB_PATH", DATA_DIR / "app.db"))

SOURCE_UTC_OFFSET = int(os.getenv("SOURCE_UTC_OFFSET", "5"))
WEATHER_OFFLINE = _bool("WEATHER_OFFLINE", False)

USE_MOCK_LLM = _bool("USE_MOCK_LLM", True)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL_FAST = os.getenv("OPENAI_MODEL_FAST", "gpt-4o-mini")
OPENAI_MODEL_STRONG = os.getenv("OPENAI_MODEL_STRONG", "gpt-4o")
OPENAI_MODEL_REASONING = os.getenv("OPENAI_MODEL_REASONING", "o4-mini")
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "600"))

# Тестовый период ТЗ и январский бэктест (где есть факт).
HISTORY_END = "2026-01-31 23:00"
FORECAST_ISSUES = ("2026-01-31", "2026-02-27")
BACKTEST_ISSUES = ("2026-01-01", "2026-01-30")
HORIZON_H = 48

# Хранилище: clickhouse (docker compose) | sqlite (без сервера)
DB_BACKEND = os.getenv("DB_BACKEND", "sqlite").strip().lower()
CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "localhost")
CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "default")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "default")

# OpenAI-совместимый endpoint: пусто = api.openai.com; для vLLM на NVIDIA Brev —
# http://localhost:8001/v1 (через brev port-forward)
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "").strip() or None
# Провайдер: auto | vllm | openai | mock. auto = vllm (если задан LLM_BASE_URL) -> openai -> mock.
# При сбое основного провайдера агент переходит к следующему в цепочке.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "auto").strip().lower()
VLLM_MODEL = os.getenv("VLLM_MODEL", "qwen")

CORS_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5180,http://127.0.0.1:5180").split(",") if o.strip()]

# Вход в интерфейс: пустой APP_PASSWORD — вход отключён
APP_LOGIN = os.getenv("APP_LOGIN", "admin")
APP_PASSWORD = os.getenv("APP_PASSWORD", "")
APP_SECRET = os.getenv("APP_SECRET", "")
