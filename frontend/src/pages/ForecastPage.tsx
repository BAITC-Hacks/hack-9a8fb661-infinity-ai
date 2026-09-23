import { useCallback, useMemo, useState } from 'react'
import { api } from '../api/client'
import { FilterBar, type Mode, type View } from '../components/layout/FilterBar'
import { ChartPanel } from '../features/ChartPanel'
import { EventsPanel } from '../features/EventsPanel'
import { KpiStrip } from '../features/KpiStrip'
import { WhyCard } from '../features/WhyCard'
import { useAsync } from '../hooks/useAsync'
import { kpis } from '../lib/calc'
import type { Ctx } from '../lib/ctx'

const shift = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

export function ForecastPage({ ctx }: { ctx: Ctx }) {
  const { turbine, setTurbine, issueDate, setIssueDate, tick, objs, ratedOf, llm } = ctx
  const [horizon, setHorizon] = useState<24 | 48>(48)
  const [view, setView] = useState<View>('chart')
  const [mode, setMode] = useState<Mode>('eval')
  const [nPrev, setNPrev] = useState(1)

  const metrics = useAsync(api.metrics, [tick])
  const weather = useAsync(() => api.weather(issueDate), [issueDate])
  const prevWeather = useAsync(() => (issueDate > '2026-01-01' ? api.weather(shift(issueDate, -1)) : Promise.resolve([])), [issueDate])
  const forecast = useAsync(() => api.forecast(issueDate, turbine), [issueDate, turbine, tick])
  const prev = useAsync(() => Promise.all(Array.from({ length: nPrev }, (_, k) => shift(issueDate, -(k + 1))).filter((d) => d >= '2026-01-01')
    .map((d) => api.forecast(d, turbine).then((f) => ({ issue_date: d, rows: f.rows.map((r) => ({ target_time: r.target_time, p_hat: r.p_hat })) })).catch(() => null))), [issueDate, turbine, nPrev, tick])
  const passport = useAsync(() => api.passport(issueDate), [issueDate, tick])
  const log = useAsync(() => api.log(issueDate), [issueDate, tick])

  const rated = ratedOf(turbine)
  const rows = useMemo(() => (forecast.data?.rows ?? []).filter((r) => r.lead_hours <= horizon), [forecast.data, horizon])
  const band = useCallback((lead: number) => metrics.data?.by_turbine_and_horizon.find((m) => m.turbine === turbine && m.bucket === (lead <= 24 ? '1-24h' : '25-48h'))?.mae ?? 0.15, [metrics.data, turbine])
  const k = kpis(rows, rated)
  const prevList = (prev.data ?? []).filter((x): x is NonNullable<typeof x> => x != null)

  return (
    <>
      <FilterBar turbine={turbine} onTurbine={setTurbine} horizon={horizon} onHorizon={setHorizon} issueDate={issueDate} onIssue={setIssueDate}
        view={view} onView={setView} mode={mode} onMode={setMode} nPrev={nPrev} onNPrev={setNPrev} />
      <KpiStrip k={k} showFact={mode === 'eval'} />
      <main className="space-y-4 p-4">
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <ChartPanel rows={rows} weather={weather.data ?? []} prevWeather={prevWeather.data ?? []} rated={rated} turbine={turbine} issueDate={issueDate} horizon={horizon}
            view={view} loading={forecast.loading} error={forecast.error} band={band} showFact={mode === 'eval'} prev={prevList} />
          <EventsPanel rows={rows} weather={weather.data ?? []} log={log.data ?? []} rated={rated} passport={passport.data} llm={llm} />
        </div>
        <WhyCard rows={rows} weather={weather.data ?? []} run={forecast.data?.run ?? null} log={log.data ?? []} />
        <div className="mono text-mute">{objs.length} × {objs[0]?.turbine_model ?? 'Goldwind GW109/2500'}</div>
      </main>
    </>
  )
}
