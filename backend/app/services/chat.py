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

MAX_STEPS = 5
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
        "name": "run_forecast",
        "description": "Запустить агентный цикл прогноза для даты выпуска (пересчёт).",
        "parameters": {"type": "object", "properties": {
            "issue_date": {"type": "string"}}, "required": ["issue_date"]}}},
]

SYSTEM = ("Ты инженер-агент прогнозирования выработки ВЭС «Нурлы» (2 турбины Goldwind 2.5 МВт, "
          "Алматинская обл.). Отвечай кратко, опираясь только на данные инструментов. Мощность — "
          "доля номинала 0..1 (1 = 2.5 МВт на турбину, 5 МВт станция). Время в данных — UTC "
          "(местное = UTC+5). Даты выпуска: 2026-01-01..2026-02-27. Язык ответа: {lang}.")
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


def _mock_plan(q):
    ql = q.lower()
    date = _extract_date(q)
    plan = []
    if any(w in ql for w in ("пересч", "обнов", "запуст", "rerun", "қайта есепте")) and date:
        plan.append(("run_forecast", {"issue_date": date}))
    if any(w in ql for w in ("качеств", "метрик", "mae", "точност", "ошибк", "дәл", "сапа", "қате")):
        plan.append(("get_metrics", {}))
    if any(w in ql for w in ("уведомл", "алерт", "предупрежд", "риск", "ескерту", "қауіп")) and date:
        plan.append(("get_alerts", {"issue_date": date}))
    if any(w in ql for w in ("почему", "журнал", "лог", "решени", "неге", "себеп", "шешім")) and date:
        plan.append(("get_agent_log", {"issue_date": date}))
    if date and not any(p[0] == "get_forecast" for p in plan):
        plan.append(("get_forecast", {"issue_date": date}))
    return plan or [("get_metrics", {})]


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
        elif name == "run_forecast":
            parts.append(f"Пересчёт выполнен (run {res['run_id']}, статус {res['status']}).")
    return "[mock] " + " ".join(parts)


def ask(question: str, agent_factory, lang: str = "ru"):
    """Генератор событий: {"type": "tool_call"|"tool_result"|"answer"|"error", ...}."""
    lang = lang if lang in LANG_NAME else "ru"
    if llm.is_mock():
        results = []
        for name, args in _mock_plan(question):
            yield {"type": "tool_call", "name": name, "args": args}
            try:
                res = call_tool(name, args, agent_factory)
            except Exception as e:
                res = {"error": str(e)}
            results.append((name, res))
            yield {"type": "tool_result", "name": name, "result": res}
        yield {"type": "answer", "text": _mock_answer(results, lang)}
        return

    messages = [{"role": "system", "content": SYSTEM.format(lang=LANG_NAME[lang])},
                {"role": "user", "content": question}]
    for _ in range(MAX_STEPS):
        msg = llm.chat(messages, strong=True, tools=TOOLS)
        messages.append(msg)
        calls = msg.get("tool_calls") or []
        if not calls:
            yield {"type": "answer", "text": msg.get("content") or ""}
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
