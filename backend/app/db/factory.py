"""Выбор хранилища: DB_BACKEND=clickhouse|sqlite; ClickHouse недоступен -> SQLite."""
import logging
import threading

from app.core import config
from app.db.base import Store

log = logging.getLogger(__name__)
_store: Store | None = None
_store_lock = threading.Lock()


def get_store() -> Store:
    """ClickHouse, если выбран и доступен; иначе SQLite (с предупреждением в лог)."""
    global _store
    with _store_lock:
        if _store is None:
            if config.DB_BACKEND == "clickhouse":
                try:
                    from app.db.clickhouse import ClickHouseStore
                    _store = ClickHouseStore()
                    _store.init()
                except Exception as e:
                    log.warning(
                        "ClickHouse недоступен (%s) — переключаюсь на SQLite %s", e,
                        config.DB_PATH)
                    from app.db.sqlite import SqliteStore
                    _store = SqliteStore()
            else:
                from app.db.sqlite import SqliteStore
                _store = SqliteStore()
            _store.init()
        return _store


def backend_name() -> str:
    return type(get_store()).__name__.replace("Store", "").lower()


def reset_store(store: Store | None = None):
    """Для тестов: подменить хранилище."""
    global _store
    with _store_lock:
        _store = store
        if store is not None:
            store.init()
