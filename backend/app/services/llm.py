"""LLM-слой: OpenAI (лимит токенов, кеш в SQLite, учёт usage) или mock без ключа."""
import hashlib
import json
import logging

from app import db
from app.core import config

log = logging.getLogger(__name__)


def is_mock() -> bool:
    # self-hosted vLLM (LLM_BASE_URL) ключа не требует
    return config.USE_MOCK_LLM or not (config.OPENAI_API_KEY or config.LLM_BASE_URL)


def provider() -> str:
    if is_mock():
        return "mock"
    return f"vllm@{config.LLM_BASE_URL}" if config.LLM_BASE_URL else "openai"


def _client():
    from openai import OpenAI
    return OpenAI(api_key=config.OPENAI_API_KEY or "not-needed", base_url=config.LLM_BASE_URL,
                  timeout=60, max_retries=2)


def _key(model, messages, tools):
    raw = json.dumps([model, messages, tools], sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def chat(messages, strong=False, tools=None):
    """Возвращает message-объект OpenAI (dict). Одинаковые запросы берутся из кеша."""
    model = config.OPENAI_MODEL_STRONG if strong else config.OPENAI_MODEL_FAST
    key = _key(model, messages, tools)
    store = db.get_store()
    hit = store.cache_get(key)
    if hit:
        return json.loads(hit)
    kwargs = dict(model=model, messages=messages, max_tokens=config.LLM_MAX_TOKENS,
                  temperature=0.2)
    if tools:
        kwargs["tools"] = tools
    resp = _client().chat.completions.create(**kwargs)
    msg = resp.choices[0].message.model_dump(exclude_none=True)
    usage = resp.usage
    log.info("llm %s tokens: prompt=%s completion=%s", model, usage.prompt_tokens,
             usage.completion_tokens)
    store.cache_put(key, model, json.dumps(msg, ensure_ascii=False), usage.prompt_tokens,
                    usage.completion_tokens)
    return msg


SUMMARY_SYSTEM = (
    "Ты аналитик ветроэлектростанции. По сводке прогноза на 48 часов напиши 3-5 коротких "
    "предложений на русском: ожидаемая выработка и её динамика, пиковые/штилевые окна, риски "
    "(высокая турбулентность, мороз < -10°C — обледенение, ветер > 20 м/с — отключение), "
    "достоверность прогноза. Только факты из сводки, без выдумок."
)


def mock_summary(s: dict) -> str:
    level = ("высокая" if s["mean_p"] > 0.5 else "средняя" if s["mean_p"] > 0.25 else "низкая")
    parts = [f"Ожидается {level} выработка: в среднем {s['mean_p']:.0%} номинала за 48 ч, "
             f"пик {s['max_p']:.0%} в {s['peak_time']} UTC."]
    if s["calm_hours"]:
        parts.append(f"Штилевых часов (<5% номинала): {s['calm_hours']}.")
    if s["min_temp"] is not None and s["min_temp"] < -10:
        parts.append(f"Мороз до {s['min_temp']:.0f}°C — возможен риск обледенения лопастей.")
    if s["max_v"] > 20:
        parts.append(f"Ветер до {s['max_v']:.0f} м/с — возможны защитные отключения.")
    if s.get("weather_delta") is not None:
        parts.append(f"Относительно прошлого выпуска прогноз ветра изменился в среднем на "
                     f"{s['weather_delta']:.1f} м/с.")
    parts.append("Достоверность пониженная: пропуски во входных данных."
                 if s.get("low_confidence") else "Входные данные полные, достоверность обычная.")
    return "[mock] " + " ".join(parts)


def summarize_forecast(stats: dict) -> str:
    if is_mock():
        return mock_summary(stats)
    try:
        msg = chat([{"role": "system", "content": SUMMARY_SYSTEM},
                    {"role": "user", "content": json.dumps(stats, ensure_ascii=False)}],
                   strong=False)
        return msg.get("content") or mock_summary(stats)
    except Exception as e:  # сеть/ключ/лимиты — прогноз не должен падать из-за LLM
        log.warning("LLM summary failed, fallback to mock: %s", e)
        return mock_summary(stats)
