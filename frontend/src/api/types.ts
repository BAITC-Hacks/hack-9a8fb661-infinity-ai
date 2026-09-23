export type TurbineId = 'STATION' | 'T1' | 'T2'
export type RunStatus = 'ok' | 'low_confidence' | 'failed'

export interface Run {
  id: number
  created_at: string
  issue_date: string
  mode: 'backtest' | 'forecast'
  status: RunStatus
  model_trained_until: string | null
  weather_signature: number | null
  summary: string | null
}

export interface ForecastRow {
  issue_date: string
  target_time: string
  lead_hours: number
  turbine: string
  p_hat: number
  p_curve: number | null
  v_eq: number | null
  actual: number | null
  baseline: number | null
}

export interface ForecastResponse { run: Run; rows: ForecastRow[] }

export interface MetricRow {
  turbine?: string | null
  bucket?: string | null
  issue_date?: string | null
  n: number
  mae: number
  rmse: number
  mae_base: number | null
  skill: number | null
}

export interface MetricsResponse {
  note: string | null
  by_turbine_and_horizon: MetricRow[]
  station_by_issue_date: MetricRow[]
  daily: DailyError[]
}

export interface AgentLogEntry {
  id: number
  ts: string
  session: string
  issue_date: string | null
  tool: string
  params: unknown
  result: unknown
  reason: string | null
}

export interface Health { status: string; storage: string; llm: string; weather_offline: boolean }

export interface TimelinePoint {
  issue_date: string
  target_time: string
  lead_hours: number
  p_hat: number
  actual: number | null
}

export type AgentEvent =
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'answer'; text: string }
  | { type: 'error'; text: string }
  | { type: 'done' }

export interface DailyError {
  turbine: string
  issue_date: string
  mae_base: number | null
  mae_24: number | null
  mae_48: number | null
}

export interface CurvePoint { v: number; p: number }
export interface PowerCurve { turbine: string; n_hours: number; curve: CurvePoint[]; points: CurvePoint[] }

export interface WindObject {
  object_id: number
  name: string
  latitude: number
  longitude: number
  rated_power_mw: number | null
  tower_height_m: number | null
  rotor_diameter_m: number | null
  turbine_model: string | null
  metadata_source_url: string
}

export interface QualitySummary {
  turbines: { turbine: string; count: number; hours: number; longest: number }[]
  monthly: ({ month: string } & Record<string, number | string>)[]
  longest: { turbine: string; start: string; hours: number }[]
  total_hours: number
}

export interface WeatherPoint {
  time: string
  lead_hours: number
  wind_speed_100m: number | null
  wind_direction_100m: number | null
  wind_gusts_10m: number | null
  temperature_2m: number | null
  surface_pressure: number | null
}

export interface Passport {
  issue_date: string; issue_time_utc: string; issue_time_local: string; history_available_until: string
  weather: { source: string; variables: string; runs: { lead_day: number; hours: string; published_between: string }[]; checksum: string; all_runs_before_issue: boolean }
  model: { version: string; trained_until: string | null; features: number }
  run: { id: number; created_at: string; status: string; weather_signature: number | null }
  diff_vs_previous: { prev_issue: string; overlap_hours: number; mean_abs_dp: number; mean_abs_dwind: number; prev_rows: { target_time: string; p_hat: number }[] } | null
}

export interface Alert {
  kind: 'ramp_up' | 'ramp_down' | 'calm' | 'cutout' | 'icing' | 'confidence' | 'agent'
  level: 'info' | 'warn' | 'critical'
  start: string | null
  end: string | null
  text: string
  delta_mw?: number
  delta_pct?: number
}

export interface DataObject {
  object_id: number; name: string
  rows_10min: number; expected_10min: number; missing_10min: number
  gaps: number; gap_slots: number | null; gap_hours: number
  from: string | null; to: string | null
  hours: number; downtime_hours: number; train_hours: number; train_rows: number; train_from: string | null
}
export interface DataSummary { storage: string; tz_source: string; objects: DataObject[] }
