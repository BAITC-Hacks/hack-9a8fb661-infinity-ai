"""LLM-слой: OpenAI (лимит токенов, кеш в SQLite, учёт usage) или mock без ключа."""
import hashlib
import json
import logging

from app import db
from app.core import config

log = logging.getLogger(__name__)


def providers() -> list[str]:
    """Цепочка провайдеров в порядке приоритета (без mock)."""
    if config.USE_MOCK_LLM:
        return []
    avail = []
    if config.LLM_BASE_URL:
        avail.append("vllm")
    if config.OPENAI_API_KEY:
        avail.append("openai")
    if config.LLM_PROVIDER in ("vllm", "openai"):
        return [config.LLM_PROVIDER] if config.LLM_PROVIDER in avail else []
    return avail


def is_mock() -> bool:
    return not providers()


def provider() -> str:
    chain = providers()
    if not chain:
        return "mock"
    names = {"vllm": f"vllm:{config.VLLM_MODEL}", "openai": f"openai:{config.OPENAI_MODEL_STRONG}"}
    return " → ".join(names[p] for p in chain) + " → mock"


def _client(prov: str):
    from openai import OpenAI
    if prov == "vllm":
        return OpenAI(api_key="not-needed", base_url=config.LLM_BASE_URL, timeout=90, max_retries=1)
    return OpenAI(api_key=config.OPENAI_API_KEY, timeout=60, max_retries=2)


def _model(prov: str, strong: bool) -> str:
    if prov == "vllm":
        return config.VLLM_MODEL
    return config.OPENAI_MODEL_STRONG if strong else config.OPENAI_MODEL_FAST


def _key(model, messages, tools):
    raw = json.dumps([model, messages, tools], sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def chat(messages, strong=False, tools=None):
    """Возвращает message-объект OpenAI (dict). Одинаковые запросы берутся из кеша.
    Провайдеры пробуются по цепочке; исключение — только если упали все."""
    store = db.get_store()
    last_err = None
    for prov in providers():
        model = _model(prov, strong)
        key = _key(f"{prov}/{model}", messages, tools)
        hit = store.cache_get(key)
        if hit:
            return json.loads(hit)
        kwargs = dict(model=model, messages=messages, max_tokens=config.LLM_MAX_TOKENS,
                      temperature=0.2)
        if tools:
            kwargs["tools"] = tools
        if prov == "vllm":
            # Qwen3.8 на vLLM: без режима размышлений — быстрые ответы агента
            kwargs["extra_body"] = {"chat_template_kwargs": {"enable_thinking": False}}
        try:
            resp = _client(prov).chat.completions.create(**kwargs)
        except Exception as e:
            last_err = e
            log.warning("llm %s недоступен (%s) — следующий провайдер", prov, e)
            continue
        msg = resp.choices[0].message.model_dump(exclude_none=True)
        msg.pop("reasoning_content", None)
        msg.pop("reasoning", None)
        usage = resp.usage
        log.info("llm %s/%s tokens: prompt=%s completion=%s", prov, model,
                 usage.prompt_tokens if usage else None,
                 usage.completion_tokens if usage else None)
        store.cache_put(key, f"{prov}/{model}", json.dumps(msg, ensure_ascii=False),
                        usage.prompt_tokens if usage else 0,
                        usage.completion_tokens if usage else 0)
        return msg
    raise RuntimeError(f"Все LLM-провайдеры недоступны: {last_err}")


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
