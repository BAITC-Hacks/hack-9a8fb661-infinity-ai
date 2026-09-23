# Передача модели прогноза ВЭС Нурлы

Начните с этого файла. Архив самодостаточен: весь исходный репозиторий портала не нужен.

## Что готово, чего пока нет

Готовы вычислительная модель, работа с ClickHouse, обучение, расчёт 24/48 часов,
последовательный replay с виртуальным временем, SQL и фактические данные.
Обученной модели в архиве НЕТ: реальное обучение ещё не выполнено.
Загрузчика погодного API и самих погодных выпусков в архиве НЕТ.
Нужно наполнить `wind_weather_forecasts` архивными прогнозами, доступными на каждый
исторический момент, затем обучить модель. Фактическая погода вместо прогнозов
не подходит. Дашборд и полный агентный цикл пока не реализованы.

## Содержимое

- `.env.wind` — готовые учётные данные базы `wind`, сервер <IP-хоста-ClickHouse>:8123.
  Это скрытый файл на macOS; он включён в архив намеренно для получателя.
- `backend/app/forecasting/wind_hackathon.py` — модель.
- `backend/app/forecasting/wind_hackathon_io.py` — чтение/запись ClickHouse.
- `backend/scripts/run_wind_hackathon.py` — команды train/predict/replay.
- `backend/app/clickhouse.py`, `config.py` — зависимости клиента из проекта;
  параметры портала не используются runner-ом: он берёт `WIND_CLICKHOUSE_*`.
- `db/clickhouse/wind_hackathon.sql` — четыре таблицы и часовое VIEW.
- `db/clickhouse/wind_objects_seed.sql` — INSERT двух турбин с исправленными координатами DMS.
- `data/wind_objects.csv` — тот же справочник в CSV (использовать CSV ИЛИ INSERT).
- `data/wind_actuals.csv` — объединённый факт, 291 859 записей.
- `data/source/turbine_1.csv`, `turbine_2.csv` — неизменённые исходные файлы.
- `data/wind_actuals_gaps.csv` — все 245 разрывов исходной 10-минутной сетки.
- `docs/WIND_HACKATHON.md` — подробные правила, допущения и требования к погоде.
- `MANIFEST.json` — список файлов с размером и SHA-256 для контроля целостности.
- `PROMPT_FOR_CODEX.md` — готовый промпт для Codex коллеги: контекст и порядок работы.

## 1. Подготовить Python (macOS/Linux)

Открыть терминал в распакованном каталоге `wind_hackathon_handoff`.
Нужен Python 3.12 или новее.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m unittest backend.tests.test_wind_hackathon -v
python -m backend.scripts.run_wind_hackathon --help
```

Модель автоматически читает `.env.wind`. Если запуск идёт на том Mac, где Docker
публикует ClickHouse, при необходимости изменить URL на `http://localhost:8123`.
На другом компьютере нужна доступность <IP-хоста-ClickHouse> по локальной сети.
Необходимо, чтобы Docker опубликовал HTTP-порт 8123.

## 2. Проверить схему и загрузить факты

В БД `wind` выполнить `db/clickhouse/wind_hackathon.sql`.
Если `wind_objects` и `wind_actuals` уже созданы по последним DDL, они сохранятся.
Но `CREATE IF NOT EXISTS` НЕ обновляет структуру старых таблиц: сравнить столбцы.
В справочнике ключ `object_id`, в фактах — `avg_wind`, `avg_tmp`, `power_normalized`.
Если в существующей БД справочник имеет ключ `id`, согласовать его переименование
на `object_id` перед запуском: переданный код ожидает `object_id`.

Для новой выходной таблицы требуются `timestamp`, `period_type`, `power_mw`, `energy_mwh`.
Если коллега ранее создал старую версию с `target_hour`, сохранить её под свободным
именем и создать новую — порядок описан в `docs/WIND_HACKATHON.md`.
Автоматических ALTER/DROP runner не выполняет.

Выполнить `db/clickhouse/wind_objects_seed.sql`, если справочник ещё не заполнен.
Альтернатива — импорт `data/wind_objects.csv`, без `updated_at` (он заполнится сам).

Импортировать `data/wind_actuals.csv` в `wind_actuals` с точным сопоставлением:

```text
object_id,timestamp,avg_wind,avg_tmp,power_normalized
```

`loaded_at` не передавать: заполняется автоматически. Не импортировать одновременно
объединённый CSV и исходные файлы. Время принимается как фиксированный UTC+5.
Для clickhouse-client (если он установлен) можно выполнить из этого каталога:

```bash
set -a
source .env.wind
set +a
clickhouse-client --host <IP-хоста-ClickHouse> --port 9000 --user "$WIND_CLICKHOUSE_USERNAME" --password "$WIND_CLICKHOUSE_PASSWORD" --database "$WIND_CLICKHOUSE_DATABASE" --query "INSERT INTO wind_actuals (object_id, timestamp, avg_wind, avg_tmp, power_normalized) FORMAT CSVWithNames" < data/wind_actuals.csv
```

На самом Mac можно заменить host на localhost. Для DBeaver/DataGrip достаточно
импортировать CSV с этими пятью полями, единицы не менять.

Проверка после загрузки:

```sql
SELECT object_id, count(), min(timestamp), max(timestamp)
FROM wind_actuals FINAL
GROUP BY object_id ORDER BY object_id;
```

Ожидается: объект 1 — 142360 строк, объект 2 — 149499 строк.
Оба ряда: с 2023-03-11 00:00:00 по 2026-01-31 23:50:00 (UTC+5).

## 3. Подготовить погоду — обязательный следующий шаг

Наполнить `wind_weather_forecasts` архивными ПРОГНОЗАМИ для координат двух турбин.
Нужны выпуски как до cutoff обучения, так и для февральского replay.
`provider` и `weather_model` должны совпадать с аргументами обучения
(по умолчанию `open-meteo` и `ecmwf_ifs`). Название не гарантирует происхождение архива.
Минимум: ветер на 80 или 100 м и температура на каждом часу, включая правую границу
48-часового горизонта. Остальные погодные поля — по наличию.
Ветер — м/с, температура — °C, давление — гПа, осадки — мм.

Сохранять разные выпуски отдельно. `issued_at` — инициализация модели погоды,
`available_at` — когда выпуск действительно стал доступен, `valid_at` — час прогноза.
Дата скачивания архива НЕ является датой публикации. Подробности и ограничения
источника (включая различие исходного прогноза и hindcast) — в подробной инструкции.

## 4. Обучить и рассчитать

Эти команды работают ПОСЛЕ загрузки архивной погоды.
18:00 — выбранное примерное время ежедневного запуска, не требование организаторов.

```bash
python -m backend.scripts.run_wind_hackathon train --cutoff 2026-01-31T18:00:00+05:00 --artifact outputs/wind_forecast/model.joblib
python -m backend.scripts.run_wind_hackathon predict --artifact outputs/wind_forecast/model.joblib --origin 2026-01-31T18:00:00+05:00 --dry-run
python -m backend.scripts.run_wind_hackathon replay --artifact outputs/wind_forecast/model.joblib --origin 2026-01-31T18:00:00+05:00 --until 2026-02-28T18:00:00+05:00 --step-hours 24 --output outputs/wind_forecast/replay.jsonl
```

При неизвестном `available_at` обучение по умолчанию завершится ошибкой. Можно
явно принять и записать допущение `--publication-lag-hours 8` при обучении;
оно переносится в артефакт и все последующие расчёты. Не подменяет проверку источника.

`--dry-run` не записывает прогноз. Без этого флага модель пишет в БД `wind`, таблицу
`wind_power_forecasts`: 288 десятиминутных и 48 часовых строк на турбину за запуск.
Новый запуск — новый `run_id`, старые версии сохраняются. Все времена — UTC+5.
Для новой тренировки нужен новый путь артефакта: существующий файл не перезаписывается.

Результат: `period_type='10min'` или `'hour'`, нормализованная мощность, МВт и МВт·ч.
Выбирать один `run_id` и одну детализацию — не суммировать разные версии/детализации.
Фактические часы доступны в `wind_actuals_hourly`; неполные часы имеют NULL мощности.

## Проверено при сборке

Архив будет проверен распаковкой в отдельный каталог, импортом модулей, командой
`--help` и десятью тестами, включая синтетическое обучение и прогноз двух объектов.
Это не оценка точности на реальных погодных данных. Подключение к <IP-хоста-ClickHouse>
из среды автора не установилось; DDL и INSERT на сервере не выполнялись.
