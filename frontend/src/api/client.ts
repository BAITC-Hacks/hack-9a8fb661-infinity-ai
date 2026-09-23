import type {
  AgentLogEntry, ForecastResponse, Health, MetricsResponse, PowerCurve, Run, TimelinePoint, TurbineId,
} from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch { /* тело не JSON */ }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

const q = (params: Record<string, string | number | boolean | undefined>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, String(v)])).toString()

export const api = {
  health: () => request<Health>('/api/health'),
  issues: () => request<Run[]>('/api/issues'),
  forecast: (issue_date: string, turbine: TurbineId) =>
    request<ForecastResponse>(`/api/forecast?${q({ issue_date, turbine })}`),
  metrics: () => request<MetricsResponse>('/api/metrics'),
  powerCurve: (turbine: TurbineId) => request<PowerCurve>(`/api/power-curve?${q({ turbine })}`),
  log: (issue_date: string, limit = 80) =>
    request<AgentLogEntry[]>(`/api/log?${q({ issue_date, limit })}`),
  timeline: (turbine: TurbineId, max_lead = 24) =>
    request<TimelinePoint[]>(`/api/timeline?${q({ turbine, max_lead })}`),
  run: (issue_date: string, force = true) =>
    request<Run>(`/api/run?${q({ issue_date, force })}`, { method: 'POST' }),
  agentStreamUrl: (question: string) => `/api/agent?${q({ q: question })}`,
  exportCsvUrl: '/api/export/forecasts.csv',
}
