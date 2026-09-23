"""Тесты работают без сети, ключей и серверов: SQLite во временной папке, погода из кеша."""
import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="wind-tests-"))
os.environ.update({
    "USE_MOCK_LLM": "true", "OPENAI_API_KEY": "", "LLM_BASE_URL": "",
    "WEATHER_OFFLINE": "true", "DB_BACKEND": "sqlite",
    "DB_PATH": str(_tmp / "test.db"), "OUTPUT_DIR": str(_tmp / "outputs"),
})

import pytest  # noqa: E402

from app.ml.pipeline import Forecaster  # noqa: E402


@pytest.fixture(scope="session")
def forecaster():
    f = Forecaster(offline=True)
    f.train("2026-01-20")
    return f
