from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

import requests
from requests import RequestException

from backend.app.config import get_settings


class ClickHouseQueryError(RuntimeError):
    pass


class ClickHouseClient:
    def __init__(
        self,
        *,
        url: str,
        database: str,
        username: str,
        password: str,
        timeout: int = 30,
    ) -> None:
        self.url = url.rstrip("/")
        self.database = database
        self.username = username
        self.password = password
        self.timeout = timeout

    def query_json_each_row(
        self,
        query: str,
        parameters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Запрос к ClickHouse.

        `parameters` подставляются серверными параметрами `{name:Type}`
        (передаются как `param_<name>`) — значения не склеиваются со строкой
        запроса, инъекция невозможна.
        """
        request_params = {
            "database": self.database,
            "user": self.username,
            "password": self.password,
            "date_time_input_format": "best_effort",
        }
        for name, value in (parameters or {}).items():
            request_params[f"param_{name}"] = str(value)
        try:
            response = requests.post(
                self.url,
                params=request_params,
                data=f"{query.rstrip()}\nFORMAT JSONEachRow",
                timeout=self.timeout,
            )
        except RequestException as exc:
            raise ClickHouseQueryError(str(exc)) from exc

        if not response.ok:
            raise ClickHouseQueryError(response.text)

        rows = []
        for line in response.text.splitlines():
            if line.strip():
                rows.append(json.loads(line))
        return rows

    def command(self, query: str) -> None:
        try:
            response = requests.post(
                self.url,
                params={
                    "database": self.database,
                    "user": self.username,
                    "password": self.password,
                    "date_time_input_format": "best_effort",
                },
                data=query.rstrip(),
                timeout=self.timeout,
            )
        except RequestException as exc:
            raise ClickHouseQueryError(str(exc)) from exc

        if not response.ok:
            raise ClickHouseQueryError(response.text)

    def insert_json_each_row(self, table: str, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return

        payload = "\n".join(json.dumps(row, ensure_ascii=False) for row in rows)
        try:
            response = requests.post(
                self.url,
                params={
                    "database": self.database,
                    "user": self.username,
                    "password": self.password,
                    "date_time_input_format": "best_effort",
                },
                data=f"INSERT INTO {table} FORMAT JSONEachRow\n{payload}",
                timeout=self.timeout,
            )
        except RequestException as exc:
            raise ClickHouseQueryError(str(exc)) from exc

        if not response.ok:
            raise ClickHouseQueryError(response.text)


@lru_cache
def get_clickhouse_client(*, agents: bool = False) -> ClickHouseClient:
    """Клиент под основным пользователем; agents=True — под пользователем агентов.

    Запросы агентов на данных и оперативного ассистента идут readonly-
    пользователем с лимитами (deploy/clickhouse/agents-user.xml), когда он
    задан в окружении; без него — тем же клиентом, что у всего приложения.
    """
    settings = get_settings()
    username, password = settings.clickhouse_username, settings.clickhouse_password
    if agents and settings.clickhouse_agents_username:
        username, password = settings.clickhouse_agents_username, settings.clickhouse_agents_password
    return ClickHouseClient(
        url=settings.clickhouse_url,
        database=settings.clickhouse_database,
        username=username,
        password=password,
        timeout=settings.clickhouse_timeout_seconds,
    )
