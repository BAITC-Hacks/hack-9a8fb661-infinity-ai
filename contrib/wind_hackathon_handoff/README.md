# Комплект прогноза двух турбин Нурлы

Архив самодостаточен. В нём модель, загрузчики погоды, автономный контроллер,
проверка качества, февральский replay, SQL, справочник и объединённые факты.
Обученного артефакта пока нет: он создаётся на машине с доступом к ClickHouse.
Подробности и допущения: `docs/WIND_HACKATHON.md`. Задание Codex коллеги:
`PROMPT_FOR_CODEX.md`.

## 1. Установить

Python 3.12+, терминал в распакованном `wind_hackathon_handoff`:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m unittest backend.tests.test_wind_hackathon backend.tests.test_wind_hackathon_agent -v
```

`.env.wind` уже содержит выданные креды базы `wind` на `<IP-хоста-ClickHouse>:8123`.
Это скрытый файл на macOS. На самом Mac с Docker при необходимости заменить
URL на `http://localhost:8123`; переменные окружения имеют приоритет над файлом.
Полный репозиторий, PostgreSQL, FastAPI, Torch и TimesFM не нужны.

## 2. Подготовить ClickHouse

В базе `wind` выполнить `db/clickhouse/wind_hackathon.sql`.
Если таблицы уже созданы, дополнительно выполнить
`db/clickhouse/wind_hackathon_upgrade.sql`: новые поля добавляются без удаления данных.
`CREATE IF NOT EXISTS` сам по себе не обновляет существующую структуру.

Если старая выходная таблица содержит `target_hour`, а не `timestamp` и `period_type`,
порядок сохранения её под другим именем описан в подробной инструкции.
Ожидаемый ключ справочника — `object_id`, а не `id`.

Справочник загрузить из `db/clickhouse/wind_objects_seed.sql` **либо** из
`data/wind_objects.csv`. Если он уже заполнен, проверить координаты/характеристики.
Факт импортировать из `data/wind_actuals.csv` с явным списком столбцов:

```text
object_id,timestamp,avg_wind,avg_tmp,power_normalized
```

`loaded_at` заполняется автоматически. Исходные CSV в `data/source/` — для сверки,
повторно их не импортировать. Время фиксированное UTC+5, без дополнительного сдвига.
Ожидается 142360 строк у объекта 1 и 149499 у объекта 2, всего 291859.
Период — 11.03.2023–31.01.2026; февральского факта нет.

```bash
python -m backend.scripts.run_wind_hackathon check
```

## 3. Загрузить погоду, обучить и воспроизвести февраль

Основной загрузчик обращается к Open-Meteo Single Runs по `latitude/longitude`
каждой турбины из ClickHouse, хранит отдельные выпуски и происхождение ответа.
Обе турбины могут попасть в одну погодную ячейку; модели мощности у них разные.

Для исследовательского запуска через Open-Meteo:

```bash
python -m backend.scripts.run_wind_hackathon workflow --source open-meteo --allow-hindcast --training-start 2025-10-01T18:00:00+05:00 --output-dir outputs/wind_forecast/open_meteo_experiment
```

Оговорка существенна: ранний IFS архив в документации источника обозначен как
`49R1 hindcasts`. Поэтому эксперимент требует явного `--allow-hindcast` и
помечается как неподтверждённый для требования «прогноз был доступен тогда».
Он не должен выдаваться за подтверждённый as-issued результат.
Для Open-Meteo принято доступность = инициализация + 8 часов.

Для строгого воспроизведения с оригинальным операционным архивом:

```bash
python -m pip install -r backend/requirements-wind-noaa.txt
python -m backend.scripts.run_wind_hackathon workflow --source noaa-gfs --training-start 2025-10-01T18:00:00+05:00 --output-dir outputs/wind_forecast/gfs_replay
```

NOAA требует существенно больше трафика; сначала можно проверить `fetch-weather`
за один origin. Происхождение и дата публикации проверяются по оригинальным GRIB.
Переключение источника требует отдельного обучения, автоматической подмены нет.

Workflow выполняет загрузку, отдельную проверку качества до февраля, финальное
обучение и ежедневные origin с 31.01.2026 18:00 до 28.02.2026 18:00 UTC+5.
Горизонт 48 часов, по 288 десятиминуток и 48 часов на объект за запуск.
Выход сохраняется в `wind_power_forecasts`, погода — в `wind_weather_forecasts`.
Пропуски факта исключаются через правило полного часа, не заполняются нулями.

## 4. Посмотреть результат и включить обновления

В выбранном `output-dir` будут:

- `model.joblib` — финальная обученная модель;
- `holdout_metrics.json` — независимая проверка до тестового периода;
- `training_metrics.json` — отрезок настройки финальной модели;
- `replay.jsonl` — все origin и обе детализации;
- `february_hourly_all_origins.csv` и `february_hourly_latest.csv` — часовые выгрузки;
- `workflow.json` — итоговый статус и проверка 1344 февральских часов;
- `replay/decisions.jsonl` — решения контроллера и причины повторных расчётов.

Автоматическое наблюдение в виртуальном времени:

```bash
python -m backend.scripts.run_wind_hackathon agent --source open-meteo --allow-hindcast --artifact outputs/wind_forecast/open_meteo_experiment/model.joblib --origin 2026-02-15T18:00:00+05:00 --watch --refresh --poll-seconds 900
```

Без `--origin` используется текущий час. `--cycles 3` ограничивает число циклов.
Изменились погода или модель — новый run_id; входы прежние — повтор пропускается.
Полнота горизонта и единицы проверяются до публикации. Новые факты используются
для оценки через `evaluate`, переобучение запускается отдельно с новым cutoff.
Контроллер основан на правилах, LLM не используется. Дашборда в комплекте нет.

Не складывать разные `run_id` или обе детализации. Использовать `FINAL` и фильтр
`period_type = 'hour'` либо `'10min'`. CF × 2.5 = МВт; энергия = МВт × часы.

## Что проверено при подготовке

Синтетические тесты проходят, включая полный февральский workflow: 29 origin,
19488 строк, 1344 уникальных февральских часа. Реальные запросы Open-Meteo по двум
координатам и декодирование архивного GFS выполнены успешно. Это не оценка реальной
точности. Из среды автора ClickHouse недоступен, поэтому настоящее обучение,
полный погодный backfill и запись прогнозов нужно выполнить на машине коллеги.

`MANIFEST.json` содержит размеры и SHA-256 всех файлов комплекта.
