"""Диалоговый агент: LLM сам выбирает инструменты (function calling) над прогнозами.

В mock-режиме инструменты выбираются правилами по тексту вопроса — сценарий тот же,
ключ не нужен.
"""
import json
import re

import pandas as pd

from app import db
from app.core import config
from app.services import llm
from app.services.export import overall_metrics

MAX_STEPS = 6
DATE_RE = re.compile(r"(20\d\d)-(\d\d)-(\d\d)|(\d{1,2})[./](\d{1,2})(?:[./](20\d\d))?")

TOOLS = [
    {"type": "function", "function": {
        "name": "get_forecast",
        "description": "Почасовой прогноз мощности (доля номинала) на 48 ч для даты выпуска.",
        "parameters": {"type": "object", "properties": {
            "issue_date": {"type": "string", "description": "YYYY-MM-DD"},
            "turbine": {"type": "string", "enum": ["STATION", "T1", "T2"]}},
            "required": ["issue_date"]}}},
    {"type": "function", "function": {
        "name": "get_metrics",
        "description": "Качество модели на январском бэктесте: MAE, RMSE, skill против "
                       "персистентности, по горизонтам 1-24 и 25-48 ч.",
        "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {
        "name": "get_agent_log",
        "description": "Журнал решений агента (инструменты, причины пересчёта) для даты.",
        "parameters": {"type": "object", "properties": {
            "issue_date": {"type": "string"}}, "required": ["issue_date"]}}},
    {"type": "function", "function": {
        "name": "get_alerts",
        "description": "Уведомления по выпуску: резкие рост/падение мощности (окна времени), штиль, "
                       "риск остановки по ветру, обледенение, решения агента.",
        "parameters": {"type": "object", "properties": {
            "issue_date": {"type": "string"}}, "required": ["issue_date"]}}},
    {"type": "function", "function": {
        "name": "search_knowledge",
        "description": "Поиск по базе знаний проекта (эмбеддинги): паспорт станции и турбин, методика "
                       "прогноза, данные, метрики, инструкции. Для вопросов «что/как/почему устроено».",
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "run_forecast",
        "description": "Запустить агентный цикл прогноза для даты выпуска (пересчёт).",
        "parameters": {"type": "object", "properties": {
            "issue_date": {"type": "string"}}, "required": ["issue_date"]}}},
]

SYSTEM = (
    "Ты — инженер-агент диспетчерского центра ВЭС «Нурлы» (2 турбины Goldwind GW109/2500 по 2,5 МВт, "
    "станция 5 МВт, Алматинская область). Твоя задача — помогать диспетчеру понимать прогноз выработки "
    "на 24–48 часов и риски.\n"
    "Правила:\n"
    "1. Никогда не выдумывай числа: любые цифры бери только из инструментов. Если данных нет — скажи об этом.\n"
    "2. Выбор инструмента: прогноз на дату → get_forecast; «что ожидается / риски / когда упадёт или вырастет» → "
    "get_alerts; «почему» и решения агента → get_agent_log; точность и качество → get_metrics; устройство "
    "станции, турбин, методика, данные → search_knowledge; «пересчитай» → run_forecast. Можно вызывать несколько.\n"
    "3. Мощность отвечай в МВт (доля номинала × 2,5 МВт на турбину, × 5 МВт для станции), время — по Алматы "
    "(UTC+5), даты в формате ДД.ММ. Даты выпуска доступны с 01.01.2026 по 27.02.2026; факт есть только до 31.01.\n"
    "4. Отвечай кратко и по делу: 2–5 предложений или короткий список, без вступлений и повторов вопроса. "
    "Сначала вывод, потом обоснование цифрами.\n"
    "5. Если дата не названа — бери дату выпуска из контекста интерфейса. «Завтра/послезавтра/вчера» считай "
    "от неё. Если объект не назван — объект из контекста.\n"
    "6. Пользователь может писать с опечатками, без знаков препинания, транслитом, смешивая русский и казахский, "
    "разговорно («скок», «чё», «прогназ», «выроботка», «ветр»). Понимай смысл и не проси переформулировать; "
    "переспрашивай, только если вопрос действительно неоднозначен.\n"
    "7. Помни предыдущие реплики диалога: «а завтра?», «а почему?», «а для второй?» относятся к прошлому вопросу.\n"
    "Язык ответа: {lang}."
)
LANG_NAME = {"ru": "русский", "kk": "казахский (қазақша)"}

KK = {  # шаблоны mock-ответов на казахском
    "forecast": "{d} шығарылымы: орташа қуат номиналдың {mean:.0%}, ең жоғарысы {max:.0%} ({tmax}), "
                "ең төменгісі {min:.0%} ({tmin}).",
    "metrics": "Қаңтар бэктестіндегі сапа (станция): ",
    "metric_row": "{bucket}: MAE {mae:.3f}, персистенттіліктен {skill:.0%} жақсы",
    "log": "Агент шешімдері: ", "log_none": "қайта есептеу мен ескертулер болмады",
    "run": "Қайта есептелді (run {id}, күйі {status}).",
}


def validate_date(s: str) -> str:
    d = pd.Timestamp(s)
    lo, hi = pd.Timestamp(config.BACKTEST_ISSUES[0]), pd.Timestamp(config.FORECAST_ISSUES[1])
    if not lo <= d <= hi:
        raise ValueError(f"дата выпуска вне диапазона {lo.date()}..{hi.date()}")
    return str(d.date())


def _forecast_digest(issue_date, turbine="STATION"):
    store = db.get_store()
    run = store.latest_run(issue_date)
    if not run:
        return {"error": f"прогноза на {issue_date} нет — вызовите run_forecast"}
    fc = store.forecasts(run["id"], turbine)
    fc["p_hat"] = fc["p_hat"].astype(float)
    hourly = fc[["target_time", "p_hat", "actual"]].copy()
    return {"issue_date": issue_date, "status": run["status"], "summary": run["summary"],
            "mean_p": round(float(fc["p_hat"].mean()), 3),
            "max": {"p": round(float(fc["p_hat"].max()), 3),
                    "time": fc.loc[fc["p_hat"].idxmax(), "target_time"]},
            "min": {"p": round(float(fc["p_hat"].min()), 3),
                    "time": fc.loc[fc["p_hat"].idxmin(), "target_time"]},
            "every_6h": hourly.iloc[::6].round(3).to_dict("records")}


def call_tool(name, args, agent_factory):
    if name == "get_forecast":
        return _forecast_digest(validate_date(args["issue_date"]), args.get("turbine", "STATION"))
    if name == "get_metrics":
        m = overall_metrics(db.get_store().latest_forecasts())
        return {"by_turbine_and_horizon": m.get("by_turbine_and_horizon", []), "note": m.get("note")}
    if name == "get_agent_log":
        rows = db.get_store().agent_log(validate_date(args["issue_date"]), limit=30)
        return [{k: r[k] for k in ("tool", "reason", "result")} for r in rows]
    if name == "get_alerts":
        from app.services.alerts import build_alerts
        return [{k: a[k] for k in ("kind", "level", "start", "end", "text")}
                for a in build_alerts(validate_date(args["issue_date"]))]
    if name == "search_knowledge":
        from app.services.knowledge import get_index
        return get_index().search(str(args.get("query", ""))[:500])
    if name == "run_forecast":
        run = agent_factory().run_issue(validate_date(args["issue_date"]), force=True)
        return {"run_id": run["id"], "status": run["status"], "summary": run["summary"]}
    raise ValueError(f"неизвестный инструмент {name}")


def _extract_date(q):
    m = DATE_RE.search(q)
    if not m:
        return None
    if m.group(1):
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    day, month, year = int(m.group(4)), int(m.group(5)), m.group(6) or "2026"
    return f"{year}-{month:02d}-{day:02d}"


MONTHS = {"янв": 1, "фев": 2, "мар": 3, "қаң": 1, "ақп": 2}
RELATIVE = {"сегодня": 0, "бүгін": 0, "завтра": 1, "ертең": 1, "послезавтра": 2, "вчера": -1, "кеше": -1}
INTENTS = {  # стемы для нечёткого сравнения (опечатки, разговорные формы)
    "run": ("пересчит", "пересчет", "обнови", "запуст", "rerun", "қайтаесепте"),
    "metrics": ("качеств", "метрик", "точн", "ошибк", "погрешн", "дәл", "сапа", "қате", "mae"),
    "alerts": ("уведомл", "алерт", "предупрежд", "риск", "опасн", "ескерту", "қауіп", "упадет", "упадёт", "падени", "рост", "скачк"),
    "log": ("почему", "пачему", "поч", "журнал", "решени", "неге", "себеп", "шешім", "зачем"),
    "knowledge": ("башн", "ротор", "турбин", "лопаст", "модел", "методик", "как работ", "паспорт", "мощност номин", "высот", "диаметр", "где наход", "қайда"),
}


def _norm(q: str) -> str:
    return re.sub(r"[^\w\s./-]", " ", q.lower().replace("ё", "е"))


def _has(ql: str, stems, fuzzy: bool = True) -> bool:
    import difflib
    words = ql.split()
    for st in stems:
        if st in ql:
            return True
        if fuzzy and len(st) >= 5 and any(difflib.SequenceMatcher(None, w[:len(st)], st).ratio() >= 0.8 for w in words if len(w) >= 4):
            return True
    return False


def _resolve_date(q: str, context: dict):
    d = _extract_date(q)
    if d:
        return d
    m = re.search(r"(\d{1,2})\s*([а-яәіңғүұқөһ]{3})", q.lower())
    if m and m.group(2) in MONTHS:
        return f"2026-{MONTHS[m.group(2)]:02d}-{int(m.group(1)):02d}"
    import difflib
    base = context.get("issue_date")
    words = _norm(q).split()
    for w, off in sorted(RELATIVE.items(), key=lambda kv: -len(kv[0])):   # «послезавтра» раньше «завтра»
        if base and any(x == w or difflib.SequenceMatcher(None, x, w).ratio() >= 0.8 for x in words):
            return str((pd.Timestamp(base) + pd.Timedelta(days=off)).date())
    return base


def _mock_plan(q, context=None):
    context = context or {}
    ql = _norm(q)
    date = _resolve_date(q, context)
    plan = []
    if _has(ql, INTENTS["run"]) and date:
        plan.append(("run_forecast", {"issue_date": date}))
    if _has(ql, INTENTS["metrics"]):
        plan.append(("get_metrics", {}))
    if _has(ql, INTENTS["alerts"]) and date:
        plan.append(("get_alerts", {"issue_date": date}))
    wants_fc = _has(ql, ("прогноз", "прогназ", "выработ", "выробот", "мощност", "скок", "сколько", "будет", "болжам", "өндіріс"))
    if _has(ql, INTENTS["knowledge"], fuzzy=False) and not plan and not (wants_fc and date != context.get("issue_date")):
        plan.append(("search_knowledge", {"query": q}))
        return plan
    if _has(ql, INTENTS["log"]) and date:
        plan.append(("get_agent_log", {"issue_date": date}))
    explicit = _extract_date(q) or date != context.get("issue_date")
    if date and (not plan or explicit or wants_fc) and not any(p[0] == "get_forecast" for p in plan):
        plan.append(("get_forecast", {"issue_date": date}))
    return plan or [("search_knowledge", {"query": q})]


def _mock_answer(results, lang="ru"):
    parts = []
    for name, res in results:
        if isinstance(res, dict) and "error" in res:
            parts.append(res["error"])
        elif lang == "kk":
            if name == "get_forecast":
                parts.append(KK["forecast"].format(d=res["issue_date"], mean=res["mean_p"],
                             max=res["max"]["p"], tmax=res["max"]["time"], min=res["min"]["p"],
                             tmin=res["min"]["time"]))
            elif name == "get_metrics":
                st = [r for r in res["by_turbine_and_horizon"] if r["turbine"] == "STATION"]
                parts.append(KK["metrics"] + "; ".join(KK["metric_row"].format(**r) for r in st) + ".")
            elif name == "get_agent_log":
                reasons = [r["reason"] for r in res if r["reason"]]
                parts.append(KK["log"] + ("; ".join(reasons) if reasons else KK["log_none"]) + ".")
            elif name == "run_forecast":
                parts.append(KK["run"].format(id=res["run_id"], status=res["status"]))
        elif name == "get_forecast":
            parts.append(f"Выпуск {res['issue_date']}: средняя мощность {res['mean_p']:.0%} "
                         f"номинала, максимум {res['max']['p']:.0%} в {res['max']['time']}, "
                         f"минимум {res['min']['p']:.0%} в {res['min']['time']}. "
                         f"{res['summary']}")
        elif name == "get_metrics":
            st = [r for r in res["by_turbine_and_horizon"] if r["turbine"] == "STATION"]
            parts.append("Качество на январском бэктесте (станция): " + "; ".join(
                f"{r['bucket']}: MAE {r['mae']:.3f}, skill {r['skill']:.0%} к персистентности"
                for r in st) + ".")
        elif name == "get_agent_log":
            reasons = [r["reason"] for r in res if r["reason"]]
            parts.append("Решения агента: " + ("; ".join(reasons) if reasons else
                                               "пересчётов и тревог не было") + ".")
        elif name == "get_alerts":
            parts.append("Уведомления: " + (" ".join(a["text"] for a in res[:4]) if res else "событий нет."))
        elif name == "search_knowledge":
            from app.services.knowledge import answer_from_chunks
            parts.append(answer_from_chunks("", res))
        elif name == "run_forecast":
            parts.append(f"Пересчёт выполнен (run {res['run_id']}, статус {res['status']}).")
    return " ".join(parts)


def _ask_mock(question, agent_factory, lang, context=None, history=None):
    results = []
    for name, args in _mock_plan(question, context or {}):
        yield {"type": "tool_call", "name": name, "args": args}
        try:
            res = call_tool(name, args, agent_factory)
        except Exception as e:
            res = {"error": str(e)}
        results.append((name, res))
        yield {"type": "tool_result", "name": name, "result": res}
    yield {"type": "answer", "text": _mock_answer(results, lang)}


_SESSIONS: dict[str, list[dict]] = {}
HISTORY_TURNS = 8


def ask(question: str, agent_factory, lang: str = "ru", mode: str = "fast", session: str = "",
        context: dict | None = None):
    """Генератор событий: {"type": "tool_call"|"tool_result"|"thinking"|"answer"|"error", ...}.
    LLM недоступна (сеть, GPU выключен) — тот же сценарий на правилах (mock), без падения."""
    lang = lang if lang in LANG_NAME else "ru"
    context = context or {}
    history = _SESSIONS.setdefault(session, []) if session else []
    if llm.is_mock():
        yield from _ask_mock(question, agent_factory, lang, context, history)
        return
    try:
        yield from _ask_llm(question, agent_factory, lang, mode, context, history)
    except RuntimeError as e:
        yield {"type": "tool_result", "name": "llm", "result": {"fallback": str(e)}}
        yield from _ask_mock(question, agent_factory, lang, context, history)


def _remember(history: list, question: str, answer: str):
    history += [{"role": "user", "content": question}, {"role": "assistant", "content": answer}]
    del history[:-HISTORY_TURNS * 2]


def _context_note(context: dict) -> str:
    parts = []
    if context.get("issue_date"):
        parts.append(f"выбранная дата выпуска {context['issue_date']}")
    if context.get("turbine"):
        parts.append(f"объект {context['turbine']} (STATION = вся станция)")
    return ("Контекст интерфейса: " + ", ".join(parts) + ".") if parts else ""


def _ask_llm(question: str, agent_factory, lang: str, mode: str, context: dict, history: list):
    import time as _t
    t0 = _t.time()
    system = SYSTEM.format(lang=LANG_NAME[lang]) + "\n" + _context_note(context)
    messages = [{"role": "system", "content": system}, *history, {"role": "user", "content": question}]
    thoughts = []
    for _ in range(MAX_STEPS):
        msg = llm.chat(messages, strong=True, tools=TOOLS, mode=mode)
        r = msg.pop("_reasoning", None)
        if r:
            thoughts.append(r)
        messages.append(msg)
        calls = msg.get("tool_calls") or []
        if not calls:
            if thoughts:
                yield {"type": "thinking", "text": "\n\n".join(thoughts)[-6000:], "seconds": round(_t.time() - t0, 1)}
            answer = msg.get("content") or ""
            _remember(history, question, answer)
            yield {"type": "answer", "text": answer}
            return
        for c in calls:
            name = c["function"]["name"]
            try:
                args = json.loads(c["function"].get("arguments") or "{}")
                yield {"type": "tool_call", "name": name, "args": args}
                res = call_tool(name, args, agent_factory)
            except Exception as e:
                res = {"error": str(e)}
            yield {"type": "tool_result", "name": name, "result": res}
            messages.append({"role": "tool", "tool_call_id": c["id"],
                             "content": json.dumps(res, ensure_ascii=False, default=str)[:6000]})
    yield {"type": "answer", "text": "Достигнут лимит шагов агента."}
