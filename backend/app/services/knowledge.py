"""База знаний агента: векторный индекс (эмбеддинги) по документации проекта, паспорту станции,
методике прогноза и текущим метрикам.

Эмбеддинги обучаются на корпусе проекта: TF-IDF по символьным n-граммам (устойчиво к русской и
казахской морфологии) + TruncatedSVD (LSA) до 128 измерений. Индекс хранится в ClickHouse
(таблица knowledge_chunks, поиск cosineDistance) и в памяти процесса. Внешних сервисов не нужно.
"""
import hashlib
import json
import logging
import re

import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import Normalizer

from app import db
from app.core import config

log = logging.getLogger(__name__)
DIM = 128
CHUNK_CHARS = 320

GLOSSARY = """
# Методика прогноза
Прогноз почасовой выработки ВЭС на 24–48 часов. Момент выпуска — 00:00 UTC (05:00 по Алматы)
каждого дня. Входные признаки строятся только из архивных прогнозов погоды, опубликованных до
момента выпуска (previous model runs): скорость ветра на 100 м, порывы, направление, температура,
давление. Фактическая погода не используется — это исключает утечку будущего.
Модель: эмпирическая кривая мощности (медианы мощности по бинам скорости ветра с поправкой на
плотность воздуха, монотонная) плюс градиентный бустинг на остатках. Обучение — только на данных
строго раньше момента выпуска. Переобучение — при накоплении 7 суток новых фактов или при
деградации качества (MAE выпуска вдвое выше среднего).
Метрики: MAE и RMSE в долях номинальной мощности; skill = 1 − MAE модели / MAE персистентности.
Персистентность («как вчера») — та же мощность, что была в этот час сутками ранее.
Агентный цикл: получение погоды → подготовка данных → обучение → прогноз → анализ → оценка →
перепланирование (пересчёт при обновлении погоды: новый прогон или изменение ветра > 1,5 м/с;
пометка пониженной достоверности при пропусках факта > 3 ч) → отчёт.
Уведомления: резкое изменение выработки — если |ΔP| за час > 15 % Pном или за 3 ч > 30 % Pном;
штиль — выработка < 5 % Pном 3 часа подряд; риск остановки — ветер > 22 м/с (отсечка 25 м/с);
обледенение — температура ниже −10 °C.
# Данные
История работы двух турбин с 11.03.2023 по 31.01.2026 с шагом 10 минут: скорость ветра на
гондоле, температура, нормализованная активная мощность 0..1. Время в данных — UTC+5. Пропуски в
данных описаны таблицей wind_actuals_gaps: 245 пропусков, самый длинный 999 часов у турбины 1
(май–июнь 2024). Тестовый период — февраль 2026, факт по нему не предоставлен.
"""


def _passport_text() -> str:
    rows = [f"# Паспорт ВЭС «Нурлы»\nСтанция 5 МВт, посёлок Нурлы, Енбекшиказахский район Алматинской области. "
            "Оператор ТОО Samruk-Green Energy. Введена 20 июля 2020 года, строительство март–ноябрь 2018. "
            "Плановая годовая выработка около 16 млн кВт·ч. Высота площадки около 555 м над уровнем моря."]
    for t in config.TURBINES:
        rows.append(f"{t.name}: модель {t.model} (XINJIANG GOLDWIND), номинальная мощность {t.rated_power_mw} МВт, "
                    f"высота башни {t.tower_height_m} м, диаметр ротора {t.rotor_diameter_m} м, 3 лопасти из стеклопластика (Sinoma), "
                    f"класс IEC IIA/IIIA, стартовая скорость ветра 3 м/с, номинальная 10,3 м/с, максимальная рабочая 25 м/с, "
                    f"координаты {t.lat:.6f}, {t.lon:.6f}.")
    rows.append("Расстояние между турбинами около 350–400 м. Между ними подстанция и грунтовые дороги. "
                "К западу от площадки пойменная зелёная зона, к востоку — открытая песчаная степь.")
    return "\n".join(rows)


def _metrics_text() -> str:
    try:
        from app.services.export import overall_metrics
        m = overall_metrics(db.get_store().latest_forecasts())
        lines = ["# Текущее качество модели (январь 2026, бэктест)"]
        for r in m.get("by_turbine_and_horizon", []):
            lines.append(f"{r['turbine']} горизонт {r['bucket']}: MAE {r['mae']:.3f}, RMSE {r['rmse']:.3f}, "
                         f"MAE персистентности {r['mae_base']:.3f}, skill {r['skill'] * 100:.0f} %.")
        return "\n".join(lines)
    except Exception as e:  # база пуста — индекс всё равно строится
        return f"# Качество модели\nМетрики пока не рассчитаны ({e})."


def build_corpus() -> list[dict]:
    docs = [("methodology", GLOSSARY), ("passport", _passport_text()), ("metrics", _metrics_text())]
    for name in ("README.md", "gpu/README.md"):
        p = config.ROOT / name
        if p.exists():
            docs.append((name, p.read_text(encoding="utf-8")))
    chunks = []
    for src, text in docs:
        text = re.sub(r"```.*?```", " ", text, flags=re.S)
        text = re.sub(r"[|`*#>]+", " ", text)
        paras, buf = [], ""
        # режем по предложениям и строкам, пакуем в фрагменты ~CHUNK_CHARS с сохранением заголовка
        units = [u.strip() for u in re.split(r"(?<=[.!?])\s+|\n", text) if u.strip()]
        for para in units:
            para = " ".join(para.split())
            if len(buf) + len(para) > CHUNK_CHARS and buf:
                paras.append(buf); buf = para
            else:
                buf = f"{buf} {para}".strip()
        if buf:
            paras.append(buf)
        for i, ch in enumerate(paras):
            chunks.append({"id": hashlib.md5(f"{src}:{i}:{ch}".encode()).hexdigest()[:16], "source": src,
                           "chunk": i, "text": ch})
    return chunks


class KnowledgeIndex:
    def __init__(self):
        self.chunks: list[dict] = []
        self.pipe = None
        self.vectors: np.ndarray | None = None

    def train(self) -> dict:
        self.chunks = build_corpus()
        texts = [c["text"] for c in self.chunks]
        n_comp = min(DIM, max(2, len(texts) - 1))
        self.pipe = make_pipeline(
            TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1, sublinear_tf=True),
            TruncatedSVD(n_components=n_comp, random_state=0), Normalizer())
        self.vectors = self.pipe.fit_transform(texts).astype(np.float32)
        self._store()
        info = {"chunks": len(texts), "dim": int(self.vectors.shape[1]),
                "sources": sorted({c["source"] for c in self.chunks})}
        log.info("knowledge index trained: %s", info)
        return info

    def _store(self):
        store = db.get_store()
        if hasattr(store, "store_knowledge"):
            try:
                store.store_knowledge([{**c, "vector": v.tolist()} for c, v in zip(self.chunks, self.vectors)])
            except Exception as e:
                log.warning("knowledge store failed: %s", e)

    def search(self, query: str, k: int = 3) -> list[dict]:
        if self.pipe is None:
            self.train()
        q = self.pipe.transform([query]).astype(np.float32)[0]
        sims = self.vectors @ q
        idx = np.argsort(-sims)[:k]
        return [{"source": self.chunks[i]["source"], "score": round(float(sims[i]), 3), "text": self.chunks[i]["text"]}
                for i in idx if sims[i] > 0.05]


_index: KnowledgeIndex | None = None


def get_index() -> KnowledgeIndex:
    global _index
    if _index is None:
        _index = KnowledgeIndex()
        _index.train()
    return _index


def answer_from_chunks(query: str, hits: list[dict]) -> str:
    """Mock-ответ без LLM: самый релевантный фрагмент базы знаний."""
    if not hits:
        return "В базе знаний нет подходящего фрагмента."
    return hits[0]["text"][:600]


def as_json(hits):
    return json.dumps(hits, ensure_ascii=False)
