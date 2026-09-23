-- Execute explicitly in database wind. No changes to the existing VIE pipeline.
-- UTC+5 is fixed for the entire dataset, per the hackathon assumption.
CREATE TABLE IF NOT EXISTS wind_objects
(
    object_id UInt32,
    name String,
    latitude Float64,
    longitude Float64,
    rated_power_mw Nullable(Float64),
    tower_height_m Nullable(Float64),
    rotor_diameter_m Nullable(Float64),
    turbine_model Nullable(String),
    metadata_source_url String,
    metadata_note String,
    updated_at DateTime64(3, 'Etc/GMT-5') DEFAULT now64(3, 'Etc/GMT-5')
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY object_id;

CREATE TABLE IF NOT EXISTS wind_actuals
(
    object_id UInt32,
    timestamp DateTime64(3, 'Etc/GMT-5'),
    avg_wind Nullable(Float64),
    avg_tmp Nullable(Float64),
    power_normalized Nullable(Float64),
    loaded_at DateTime64(3, 'Etc/GMT-5') DEFAULT now64(3, 'Etc/GMT-5')
)
ENGINE = ReplacingMergeTree(loaded_at)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (object_id, timestamp);

CREATE TABLE IF NOT EXISTS wind_weather_forecasts
(
    object_id UInt32,
    provider LowCardinality(String),
    weather_model LowCardinality(String),
    issued_at DateTime64(3, 'Etc/GMT-5'),
    available_at Nullable(DateTime64(3, 'Etc/GMT-5')),
    valid_at DateTime64(3, 'Etc/GMT-5'),
    wind_speed_10m_ms Nullable(Float64),
    wind_speed_80m_ms Nullable(Float64),
    wind_speed_100m_ms Nullable(Float64),
    wind_speed_120m_ms Nullable(Float64),
    wind_speed_180m_ms Nullable(Float64),
    wind_direction_10m_deg Nullable(Float64),
    wind_direction_80m_deg Nullable(Float64),
    wind_direction_100m_deg Nullable(Float64),
    wind_direction_120m_deg Nullable(Float64),
    wind_direction_180m_deg Nullable(Float64),
    wind_gusts_10m_ms Nullable(Float64),
    temperature_2m_c Nullable(Float64),
    pressure_msl_hpa Nullable(Float64),
    precipitation_mm Nullable(Float64),
    loaded_at DateTime64(3, 'Etc/GMT-5') DEFAULT now64(3, 'Etc/GMT-5')
)
ENGINE = ReplacingMergeTree(loaded_at)
PARTITION BY toYYYYMM(valid_at)
ORDER BY (object_id, provider, weather_model, issued_at, valid_at);

-- Both granularities in one table; consumers MUST filter period_type.
CREATE TABLE IF NOT EXISTS wind_power_forecasts
(
    run_id UUID,
    object_id UInt32,
    forecast_origin DateTime64(3, 'Etc/GMT-5'),
    timestamp DateTime64(3, 'Etc/GMT-5'),
    period_type LowCardinality(String),
    power_normalized Float64,
    power_mw Float64,
    energy_mwh Float64,
    model_version String,
    weather_provider LowCardinality(String),
    weather_model LowCardinality(String),
    weather_issued_at DateTime64(3, 'Etc/GMT-5'),
    actuals_cutoff DateTime64(3, 'Etc/GMT-5'),
    created_at DateTime64(3, 'Etc/GMT-5') DEFAULT now64(3, 'Etc/GMT-5')
)
ENGINE = ReplacingMergeTree(created_at)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (object_id, period_type, timestamp, run_id);

CREATE VIEW IF NOT EXISTS wind_actuals_hourly AS
SELECT
    a.object_id AS object_id,
    toStartOfHour(a.timestamp) AS timestamp,
    countIf(isNotNull(a.power_normalized) AND a.power_normalized BETWEEN 0 AND 1) AS valid_points,
    avg(a.avg_wind) AS avg_wind,
    avg(a.avg_tmp) AS avg_tmp,
    if(valid_points = 6,
       avgIf(a.power_normalized, isNotNull(a.power_normalized) AND a.power_normalized BETWEEN 0 AND 1),
       NULL) AS power_normalized,
    power_normalized * any(o.rated_power_mw) AS power_mw,
    power_mw AS energy_mwh
FROM (SELECT * FROM wind_actuals FINAL) AS a
LEFT JOIN (SELECT * FROM wind_objects FINAL) AS o ON a.object_id = o.object_id
GROUP BY a.object_id, toStartOfHour(a.timestamp);

-- Missing hours have no rows; consumers may reindex to a complete time grid.
-- Read forecast tables FINAL for idempotent retries. Never sum across run_id.
