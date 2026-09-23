-- Additive migration for colleagues who already applied the previous four-table DDL.
ALTER TABLE wind_weather_forecasts
    ADD COLUMN IF NOT EXISTS source_url String DEFAULT '',
    ADD COLUMN IF NOT EXISTS source_sha256 String DEFAULT '',
    ADD COLUMN IF NOT EXISTS archive_kind LowCardinality(String) DEFAULT 'unspecified',
    ADD COLUMN IF NOT EXISTS availability_basis String DEFAULT '',
    ADD COLUMN IF NOT EXISTS requested_latitude Nullable(Float64),
    ADD COLUMN IF NOT EXISTS requested_longitude Nullable(Float64),
    ADD COLUMN IF NOT EXISTS grid_latitude Nullable(Float64),
    ADD COLUMN IF NOT EXISTS grid_longitude Nullable(Float64);

ALTER TABLE wind_power_forecasts
    ADD COLUMN IF NOT EXISTS weather_available_at Nullable(DateTime64(3, 'Etc/GMT-5')),
    ADD COLUMN IF NOT EXISTS weather_source_sha256 String DEFAULT '',
    ADD COLUMN IF NOT EXISTS weather_archive_kind LowCardinality(String) DEFAULT 'unspecified',
    ADD COLUMN IF NOT EXISTS input_sha256 String DEFAULT '';
