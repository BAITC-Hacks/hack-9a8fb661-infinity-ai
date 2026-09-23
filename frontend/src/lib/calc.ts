import type { ForecastResponse, ForecastRow } from '../api/types'

/** Validate the selected issue's exact hourly grid, including duplicate/missing targets. */
export function forecastChecks(rows: ForecastRow[], horizon: number, issueDate: string) {
  const issue = Date.parse(`${issueDate}T00:00:00Z`)
  const leads = new Set(rows.map((r) => r.lead_hours))
  const full = Number.isFinite(issue) && rows.length === horizon && leads.size === horizon
    && rows.every((r) => r.issue_date === issueDate && Number.isInteger(r.lead_hours)
      && r.lead_hours >= 1 && r.lead_hours <= horizon
      && Date.parse(r.target_time) === issue + r.lead_hours * 3600e3)
  const inRange = rows.length > 0 && rows.every((r) => Number.isFinite(r.p_hat) && r.p_hat >= 0 && r.p_hat <= 1)
  return { full, inRange, ok: full && inRange }
}

export function completedForecast(data: ForecastResponse | null, issueDate: string, horizon = 48) {
  return !!data && data.run.issue_date === issueDate
    && (data.run.status === 'ok' || data.run.status === 'low_confidence')
    && forecastChecks(data.rows, horizon, issueDate).ok
}

export const TOL_PCT = 10   // допуск отклонения, % от Pном

export interface Kpis {
  forecastMwh: number | null; factMwh: number | null; devMwh: number | null; devPct: number | null
  peakMw: number | null; peakTime: string | null; accuracy: number | null; nHours: number; nFact: number
}

/** Прогноз — весь горизонт; факт, отклонение и MAE — только часы с фактом. */
export function kpis(rows: ForecastRow[], rated: number): Kpis {
  if (!rows.length) return { forecastMwh: null, factMwh: null, devMwh: null, devPct: null, peakMw: null, peakTime: null, accuracy: null, nHours: 0, nFact: 0 }
  const p = rows.map((r) => r.p_hat)
  const iMax = p.indexOf(Math.max(...p))
  const fact = rows.filter((r) => r.actual != null)
  const fcOnFact = fact.reduce((a, r) => a + r.p_hat, 0)
  const factSum = fact.reduce((a, r) => a + r.actual!, 0)
  const mae = fact.length ? fact.reduce((a, r) => a + Math.abs(r.actual! - r.p_hat), 0) / fact.length : null
  return {
    forecastMwh: p.reduce((a, b) => a + b, 0) * rated,
    factMwh: fact.length ? factSum * rated : null,
    devMwh: fact.length ? (fcOnFact - factSum) * rated : null,
    devPct: fact.length ? ((fcOnFact - factSum) / fact.length) * 100 : null,   // % от Pном в среднем за час
    peakMw: p[iMax] * rated, peakTime: rows[iMax].target_time,
    accuracy: mae == null ? null : 100 - mae * 100,
    nHours: rows.length, nFact: fact.length,
  }
}

export type Tone = 'neutral' | 'good' | 'warn' | 'bad'
export const devTone = (pct: number | null): Tone =>
  pct == null ? 'neutral' : Math.abs(pct) <= TOL_PCT ? 'good' : Math.abs(pct) <= TOL_PCT * 2.5 ? 'warn' : 'bad'

export const fmt = (v: number | null | undefined, digits = 1) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(digits))
