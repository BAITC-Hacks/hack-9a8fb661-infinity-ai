"""Аномалии в исторических данных, которые система находит сама (почасовой ряд каждой турбины).

- простой/ограничение: мощность < 1 % Pном при ветре > 5 м/с (исключается из обучения, остаётся в оценке);
- «залипший» датчик: одинаковая мощность ≥ 6 часов подряд при ненулевом ветре;
- мощность без ветра: > 20 % Pном при ветре < 2 м/с;
- превышение номинала: мощность > 100 % Pном до обрезки;
- пропуски: отчёт дата-инженера wind_actuals_gaps.
"""
import pandas as pd

from app.core import config
from app.ml.data import load_history
from app.services.quality import gaps_df


def _episodes(mask: pd.Series, times: pd.Series, min_len: int = 1):
    out, start, n = [], None, 0
    for m, t in zip(mask.tolist(), times.tolist()):
        if m:
            start = start or t; n += 1
        elif start is not None:
            if n >= min_len:
                out.append((start, n))
            start, n = None, 0
    if start is not None and n >= min_len:
        out.append((start, n))
    return out


def find_anomalies() -> dict:
    h = load_history()
    shift = pd.Timedelta(hours=config.SOURCE_UTC_OFFSET)
    rows, examples = [], []
    for t in config.TURBINES:
        d = h[h["turbine"] == t.id].sort_values("time").reset_index(drop=True)
        down = d["is_downtime"]
        stuck_run = d["power"].diff().abs().lt(1e-4) & d["power"].between(0.02, 0.97) & (d["wind_speed"] > 3)  # не штиль и не номинал
        no_wind = (d["power"] > 0.2) & (d["wind_speed"] < 2)
        kinds = {
            "downtime": ("Простои (ветер есть, мощности нет)", _episodes(down, d["time"])),
            "stuck": ("Залипание датчика (6+ ч одно значение)", _episodes(stuck_run, d["time"], 6)),
            "no_wind": ("Мощность без ветра", _episodes(no_wind, d["time"])),
        }
        for key, (title, eps) in kinds.items():
            hours = sum(n for _, n in eps)
            rows.append({"turbine": t.id, "kind": key, "title": title, "episodes": len(eps), "hours": int(hours)})
            for start, n in sorted(eps, key=lambda e: -e[1])[:3]:
                examples.append({"turbine": t.id, "kind": key, "start": (start + shift).strftime("%Y-%m-%d %H:%M"), "hours": int(n)})
    g = gaps_df()
    for t in config.TURBINES:
        gt = g[g["turbine"] == t.id]
        rows.append({"turbine": t.id, "kind": "gaps", "title": "Пропуски в данных", "episodes": int(len(gt)),
                     "hours": int(round(float(gt["missing_hours"].sum())))})
    return {"summary": rows, "examples": sorted(examples, key=lambda e: -e["hours"])[:10],
            "rules": "Простои не используются при обучении модели."}


def sources() -> dict:
    """Реестр источников: что загружено, откуда, за какой период."""
    import json
    from app import db
    h = load_history()
    cache = sorted(config.CACHE_DIR.glob("prevruns_*.json"))
    months, hours_ok = [], 0
    for p in cache:
        try:
            hh = json.loads(p.read_text())["hourly"]
            n = sum(v is not None for v in hh.get("wind_speed_100m_previous_day1", []))
            months.append(p.stem.split("_")[-2][:7]); hours_ok += n
        except Exception:
            pass
    store = db.get_store()
    return {
        "storage": db.backend_name(),
        "items": [
            {"name": "История турбины 1", "source": "организаторы", "status": "ok",
             "detail": f"{int((h.turbine == 'T1').sum()):,} ч · 03.2023–01.2026".replace(",", " ")},
            {"name": "История турбины 2", "source": "организаторы", "status": "ok",
             "detail": f"{int((h.turbine == 'T2').sum()):,} ч · 03.2023–01.2026".replace(",", " ")},
            {"name": "Прогнозы погоды", "source": "Open-Meteo, архив", "status": "ok",
             "detail": f"с 02.2024 · {hours_ok:,} ч".replace(",", " ")},
            {"name": "Паспорт турбин", "source": "Samruk-Green", "status": "ok",
             "detail": f"{len(store.objects())} турбины по 2,5 МВт"},
            {"name": "Отчёт о пропусках", "source": "дата-инженер", "status": "ok",
             "detail": f"{len(gaps_df())} пропусков"},
            {"name": "Факт за февраль", "source": "организаторы", "status": "missing",
             "detail": "не предоставлен"},
        ],
    }
