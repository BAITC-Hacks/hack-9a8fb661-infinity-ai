from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DIST_DIR = ROOT_DIR / "frontend" / "dist"
DEFAULT_ADMIN_DIST_DIR = ROOT_DIR / "admin-frontend" / "dist"
DEFAULT_MEDIA_DIR = ROOT_DIR / "frontend" / "src" / "assets"
# Исходники фактических балансов (xlsx). В проде — том /data, а не /media:
# каталог media раздаётся статикой наружу, внутренним документам KEGOC
# там не место.
DEFAULT_BALANCE_DIR = ROOT_DIR / "data" / "balance"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "KEGOC API"
    api_prefix: str = "/api"
    # Прод-БД приложения — PostgreSQL (AD-4). Дефолт указывает на неё
    # намеренно: раньше здесь стоял SQLite, и потерянная переменная окружения
    # тихо уводила прод в файл /data/app.db вместо базы. Для локальной
    # разработки SQLite задаётся явно через DATABASE_URL.
    database_url: str = "postgresql+psycopg://kegoc:change-me-postgres@postgres:5432/kegoc_app"
    #: Размер пула соединений к PostgreSQL. По умолчанию SQLAlchemy держит
    #: 5 + 10 про запас, а за них борются 71 синхронный эндпоинт (они идут в
    #: пул потоков на 40), три параллельных разбора заявок, планировщики
    #: прогнозов и фоновый Red Teaming. Под нагрузкой пул кончался, и запрос
    #: падал по таймауту ожидания соединения, а не по своей вине.
    db_pool_size: int = 20
    db_max_overflow: int = 20
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    log_level: str = "INFO"
    log_format: str = "json"
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
        ]
    )
    ai_gateway_api_key: str | None = None
    lovable_api_key: str | None = None
    ai_gateway_url: str = "http://10.9.120.3:8000/v1/chat/completions"
    ai_model: str = "qwen2.5:14b"
    # Модель для описания приложенных к чату изображений (services/image_intake.py):
    # на vLLM 10.9.120.3 тот же Qwen3.6 отвечает под именем qwen-chat и принимает картинки.
    ai_vision_model: str = "qwen-chat"
    #: Модель для рассказа агентов на данных (routers/ai_agents._run_data_agent_chat):
    #: на vLLM 10.9.120.3 Qwen3.6 отвечает под именем qwen-chat; AI_MODEL (qwen2.5:14b)
    #: — имя прежнего шлюза, vLLM его отвергает «model does not exist».
    ai_chat_model: str = "qwen-chat"
    ai_num_ctx: int = 4096
    ai_max_tokens: int = 700
    ai_temperature: float = 0.2
    ai_top_p: float = 0.9
    # Ключ RAGFlow для страницы «ИИ-агенты». Задан — на старте раздаётся всем
    # агентам из AGENT_CATALOG и включает их; пуст — значение в БД не трогается.
    ragflow_api_key: str | None = None
    #: Адрес RAGFlow для служебных обращений вне карточек агентов (зеркало).
    ragflow_base_url: str = "https://rag.kegoc.kz"
    #: Ночное зеркало RAGFlow по API (services/ragflow_backup.py): канвасы,
    #: чаты, датасеты с подлинниками — в каталог на томе app-data, дальше его
    #: упаковывает backup.sh. Выключено по умолчанию; включать на проде.
    ragflow_backup_enabled: bool = False
    ragflow_backup_hour: int = 1
    ragflow_backup_dir: str = "/data/ragflow-mirror"
    ragflow_backup_verify_tls: bool = True
    #: Датасет RAGFlow «ДАРЗИ: служебные материалы» — база знаний «Анализа ЭЭ
    #: рынка», которую администратор пополняет из админки (services/agent_knowledge.py).
    #: Умолчание — датасет прода, созданный 18.09.2026; RAGFlow у контуров общий.
    market_internal_dataset_id: str = "12ad30e6b32311f1b2f85ffda66b15d7"
    #: Датасет «НПА: электроэнергетика» — тексты актов с adilet; его раз в
    #: неделю сверяет с adilet services/law_refresh.py. Выключатель — на случай,
    #: если adilet с сервера недоступен и попытки только засоряют лог.
    market_law_dataset_id: str = "4a9828c4b28a11f1b2f85ffda66b15d7"
    enable_law_refresh: bool = True
    #: Датасет «Отраслевые сайты: rfc, korem, kegoc» — свой индекс трёх сайтов,
    #: снимается ночью services/site_index.py. TLS выключается только для запуска
    #: с рабочей машины, где корень корпоративного шлюза не в certifi.
    market_sites_dataset_id: str = "c0651e3cb36511f1b2f85ffda66b15d7"
    #: Датасет «KEGOC: отраслевые материалы» (анализы рынка, прогнозный баланс) —
    #: третий источник диалогового режима агента рынка (services/agent_dialog.py).
    market_kegoc_dataset_id: str = "f6c38b7eb29011f1b2f85ffda66b15d7"
    enable_site_index: bool = True
    site_index_verify_tls: bool = True
    #: Свой SearXNG на сервере RAGFlow (rag/ops/searxng/) — внешний поиск для
    #: инструмента search_web диалогового режима (services/agent_dialog.py); канвасы
    #: ходят к нему сами. Пусто — инструмент честно отвечает, что поиск не настроен.
    searxng_url: str = "http://10.9.73.34:4000"
    #: Адрес портала снаружи. Из него собираются подписанные ссылки на
    #: подлинники заявок, которые модератор открывает из карточки на
    #: корпоративном портале, — они обязаны быть абсолютными и рабочими.
    #: На стенде задаётся переменной PUBLIC_BASE_URL (там это http и IP).
    public_base_url: str = "https://ai.kegoc.kz"
    #: Адрес Grafana снаружи, для фрейма на странице «Мониторинг GPU».
    #: Настройка рантайма, а не сборки: адрес свой на каждом контуре
    #: (стенд — 10.9.75.82:3000, прод — 10.9.42.93:3000), и переезд не должен
    #: требовать пересборки фронтенда. Пусто — фронтенд берёт хост портала
    #: с портом 3000 (так поднят локальный compose).
    grafana_public_url: str = ""
    #: Внутренний адрес Grafana для прокси на `/grafana`. Имя сервиса в сети
    #: compose: наружу ходить незачем, и так работает на любом контуре.
    grafana_internal_url: str = "http://grafana:3000"
    #: Токен сервисной учётки Grafana (роль Viewer), которым прокси ходит за
    #: панелями. Обычно пуст: портал заводит учётку и токен сам, при первом
    #: обращении к фрейму, — иначе прокси не работал бы до того, как человек
    #: сходит в Grafana руками. Задают его, только чтобы прибить конкретный
    #: токен: например, когда админский пароль порталу давать не хотят.
    grafana_service_token: str = ""
    #: Админ Grafana — им заводится та самая сервисная учётка. Те же значения,
    #: что у самой Grafana в compose. Пароля нет и токена нет — прокси
    #: выключен, фрейм идёт прямо на `grafana_public_url`.
    grafana_admin_user: str = "admin"
    grafana_admin_password: str = ""
    #: Куда разрешено слать callback с результатом разбора, хосты через
    #: запятую. Пусто — любой адрес: на стенде адрес портала ещё меняется.
    #: На проде список заполняется, иначе владелец токена может заставить
    #: нас постучаться куда угодно внутри контура.
    #:
    #: Строка, а не list[str], намеренно: pydantic-settings разбирает
    #: составной тип из окружения как JSON ДО валидаторов, а compose
    #: подставляет переменную всегда — пустой строкой, если она не задана.
    #: Пустая строка не JSON, и приложение падало на старте целиком, ещё до
    #: логов (стенд 07.09.2026). Разбор — в свойстве ниже.
    #: Умолчание с 22.09.2026 — корпоративный портал заявок (portal.kegoc.kz)
    #: и сервер, с которого он ходит к нам (10.9.75.52: его же адрес стоит в
    #: примерах callback в docs/PORTAL-INTEGRATION-API.md — оставить только домен
    #: значило бы отвечать им 403). Держать список пустым, то есть «куда угодно»,
    #: незачем; пустая строка по-прежнему снимает ограничение — на случай переезда
    #: портала до правки переменной.
    portal_callback_allowed_hosts: str = "portal.kegoc.kz,10.9.75.52"
    #: Класть ли разобранные заявки портала в архив РиИД, чтобы следующие
    #: разборы находили их как похожие. Выключается, если служба решит, что
    #: в архиве должны быть только заявки с решением Комитета: заявки при
    #: этом остаются в журнале, а из архива их убирает
    #: backend/scripts/prune_portal_archive.py.
    riid_archive_submissions: bool = True
    #: Датасет архива. По имени, а не по идентификатору: датасет пересобирали
    #: и пересоберут, а имя — то, что видит человек в RAGFlow. Совпадает с
    #: DATASET_NAME конвейера rag/archive/upload_dataset.py.
    riid_archive_dataset: str = "Архив заявок РиИД (полный)"
    # Единый вход через корпоративный Keycloak (realm ai-kegoc, федерация с AD
    # KEGOC). Пока флаг выключен, работает только вход по паролю — код входа
    # через домен полностью бездействует. Включается сначала на стенде.
    # Схема — обмен кода на токен на бэкенде: `oidc_client_secret` живёт только
    # здесь и в браузер не попадает.
    oidc_enabled: bool = False
    # Realm `SSO` с 17.09.2026: ITL завели отдельный realm для порталов и
    # перенесли туда клиента `ai-kegoc-prod` (тот же id и секрет, Kerberos
    # включён, redirect ограничен нашими адресами). До этого были `ai-kegoc`
    # (удалён 15.09) и `master`. Проверка realm: discovery отвечает 200, а
    # auth-endpoint с нашим client_id — 401 Negotiate, не «Client not found».
    oidc_issuer: str = "https://keycloak.kegoc.kz/realms/SSO"
    oidc_client_id: str = ""
    oidc_client_secret: str | None = None
    #: TLS до keycloak.kegoc.kz. Сертификат внутренний, а requests ходит по
    #: certifi, а не по системному хранилищу, — как и open-meteo. Пусто —
    #: обычная проверка; путь к PEM с корпоративным корнем, если проверка
    #: падает с SELF_SIGNED_CERT_IN_CHAIN (перехват TLS шлюза KEGOC).
    oidc_ca_bundle: str | None = None
    oidc_ssl_verify: bool = True
    #: Область запроса к Keycloak. `openid` обязателен; profile/email дают имя
    #: и почту доменной учётки, по которым заводится пользователь портала.
    oidc_scopes: str = "openid profile email"
    #: Разделы, которые новый доменный пользователь получает автоматически при
    #: первом входе (через запятую, ключи из page_access.py). Решение владельца
    #: портала: доменный вход по умолчанию открывает только Карту НЭС, остальные
    #: разделы Ситуационный центр выдаёт вручную по запросу пользователя.
    #: Пусто — заводить без прав. Действует только на впервые заведённую учётку;
    #: снятые админом права повторный вход не возвращает.
    oidc_default_page_access: str = "ai_karta_nes"
    open_meteo_ssl_verify: bool = True
    open_meteo_ca_bundle: str | None = None
    # Гостевой вход на встраиваемую Карту НЭС (/embed/nes-map): страница сама
    # получает токен служебной учётки, ограниченный GET-эндпоинтами карты.
    # Выключен по умолчанию: включать только для внешнего virtual host
    # партнёра (docs/EMBED_NES_MAP_API.md).
    embed_nes_map_guest_enabled: bool = False
    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None
    bootstrap_admin_full_name: str = "Administrator"
    clickhouse_url: str = "http://localhost:8123"
    clickhouse_database: str = "kegoc"
    clickhouse_username: str = "default"
    clickhouse_password: str = ""
    clickhouse_timeout_seconds: int = 120
    #: Отдельный пользователь ClickHouse для запросов ИИ-агентов и оперативного
    #: ассистента: readonly, только база kegoc, потолки по времени и памяти
    #: (deploy/clickhouse/agents-user.xml). Пусто — ходим основным пользователем.
    clickhouse_agents_username: str = ""
    clickhouse_agents_password: str = ""
    # Адрес заявки в корпоративном портале для перехода из журнала
    # интеграции: шаблон с {id}. Пусто — ссылки в админке нет, номер
    # заявки остаётся просто текстом.
    portal_application_url: str = ""
    # Регулярные проверки Red Teaming. Выключены по умолчанию: прогон идёт в
    # живой RAGFlow, а он у стенда и прода общий — включать нужно на одном
    # контуре. День недели 0 = понедельник, час в поясе Asia/Almaty.
    ai_redteam_schedule_enabled: bool = False
    ai_redteam_weekday: int = 5
    ai_redteam_hour: int = 3
    # Ночной эталонный прогон агентов (services/agent_eval.py): по той же
    # причине выключен по умолчанию и включается на одном контуре — на dev.
    # Час в поясе Asia/Almaty: после обхода сайтов (02:00) и сверки законов (03:30).
    agent_eval_schedule_enabled: bool = False
    agent_eval_hour: int = 4
    enable_embedded_schedulers: bool = True
    #: Подготовку схемы и досев при старте приложения делает сам процесс. При
    #: нескольких воркерах это переносится в предстарт (backend.app.prestart),
    #: который выполняется один раз до форка, а воркеры на старте эти шаги
    #: пропускают — entrypoint выставляет им RUN_BOOTSTRAP_ON_STARTUP=false.
    #: В тестах и одиночном запуске переменная не задана — остаётся True, и
    #: старт по-прежнему сам мигрирует и досевает.
    run_bootstrap_on_startup: bool = True
    #: Ограничение частоты. Пороги — на один воркер: счётчик живёт в памяти
    #: процесса (AD-1, без брокера), и при WEB_CONCURRENCY>1 общий предел
    #: умножается на число воркеров. Значения с запасом, чтобы живой человек
    #: их не задевал: вход — попытки пароля, чат — запросы к агенту.
    login_rate_limit: int = 10
    login_rate_window_seconds: int = 300
    agent_chat_rate_limit: int = 30
    agent_chat_rate_window_seconds: int = 60
    #: Сколько запросов к агентам обрабатывается одновременно в одном воркере.
    #: Упирается не в наш процесс, а в видеокарты: очередь лучше держать здесь,
    #: где можно ответить понятной ошибкой, чем в vLLM по таймауту.
    agent_chat_max_concurrent: int = 8
    #: Кэш ответов на повторяющиеся вопросы (services/agent_answer_cache.py):
    #: первый вопрос диалога без вложений отдаётся из кэша, пока запись
    #: моложе TTL. Выключить — при отладке канваса, когда ответ должен
    #: приходить с живого прогона.
    agent_answer_cache_enabled: bool = True
    agent_answer_cache_ttl_hours: int = 24
    #: Срок жизни кэша дашбордов. Данные приходят раз в полчаса, но графики
    #: тянут десятки людей одновременно — короткого кэша достаточно.
    dashboard_cache_ttl_seconds: int = 45
    enable_generation_forecasts: bool = False
    enable_vie_forecasts: bool = False
    enable_consumption_node_forecasts: bool = False
    frontend_dist_dir: Path = DEFAULT_DIST_DIR
    admin_frontend_dist_dir: Path = DEFAULT_ADMIN_DIST_DIR
    media_dir: Path = DEFAULT_MEDIA_DIR
    balance_dir: Path = DEFAULT_BALANCE_DIR

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("ai_model", mode="before")
    @classmethod
    def normalize_ai_model(cls, value: str | None) -> str:
        model = str(value or "qwen2.5:14b").strip()
        normalized = model.lower().replace("_", " ").replace("-", " ")
        if normalized in {"qwen", "qwen 3.6", "qwen3.6:latest", "qwen chat", "qwen2.5:14b"}:
            return "qwen2.5:14b"
        return model

    @property
    def effective_ai_gateway_api_key(self) -> str | None:
        return self.ai_gateway_api_key or self.lovable_api_key

    @property
    def callback_allowed_hosts(self) -> list[str]:
        """Хосты, куда разрешено слать callback. Пустой список — без ограничений."""
        return [
            host.strip().lower() for host in self.portal_callback_allowed_hosts.split(",") if host.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
