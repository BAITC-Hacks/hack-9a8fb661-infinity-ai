import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api/client'
import type { TurbineId } from './api/types'
import { Tile, type Tone } from './components/ui/Tile'
import { Sidebar } from './components/layout/Sidebar'
import { AgentWidget } from './features/AgentWidget'
import { DailyErrorPanel } from './features/DailyErrorPanel'
import { ForecastPanel, ISSUE_MAX, ISSUE_MIN } from './features/ForecastPanel'
import { PowerCurvePanel } from './features/PowerCurvePanel'
import { TestPeriodPanel } from './features/TestPeriodPanel'
import { useAsync } from './hooks/useAsync'
import { pct } from './lib/format'

const NAMES: Record<TurbineId, string> = { STATION: 'Станция', T1: 'Турбина 1', T2: 'Турбина 2' }

export default function App() {
  const [turbine, setTurbine] = useState<TurbineId>('STATION')
  const [horizon, setHorizon] = useState<24 | 48>(48)
  const [issueDate, setIssueDate] = useState('2026-01-31')
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const health = useAsync(api.health, [])
  const metrics = useAsync(api.metrics, [tick])
  const forecast = useAsync(() => api.forecast(issueDate, turbine), [issueDate, turbine, tick])
  const log = useAsync(() => api.log(issueDate), [issueDate, tick])
  const timeline = useAsync(() => api.timeline(turbine), [turbine, tick])
  const curve = useAsync(() => api.powerCurve(turbine), [turbine])

  useEffect(() => { setRunMsg(null) }, [issueDate])

  const rows = useMemo(() => (forecast.data?.rows ?? []).filter((r) => r.lead_hours <= horizon), [forecast.data, horizon])
  const band = useCallback((lead: number) => {
    const b = lead <= 24 ? '1-24h' : '25-48h'
    return metrics.data?.by_turbine_and_horizon.find((m) => m.turbine === turbine && m.bucket === b)?.mae ?? 0.15
  }, [metrics.data, turbine])

  const k = kpis(rows)
  const run = async () => {
    setRunning(true)
    try { const r = await api.run(issueDate); setRunMsg(`Готово: ${r.status}`); refresh() }
    catch (e) { setRunMsg(`Ошибка: ${(e as Error).message}`) }
    finally { setRunning(false) }
  }
  const status = forecast.data?.run.status

  return (
    <div className="min-h-full pl-14">
      <Sidebar turbine={turbine} onTurbine={setTurbine} onRun={run} running={running} runMsg={runMsg} health={health.data} />

      <main className="mx-auto max-w-[1400px] space-y-4 p-5">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[22px] font-semibold">{NAMES[turbine]} · выработка на {horizon} ч</h1>
          {status && (
            <span className={`text-sm ${status === 'ok' ? 'text-mute' : 'text-warn'}`}>
              {status === 'ok' ? 'данные полные' : 'пониженная достоверность'}
            </span>
          )}
        </header>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          <Tile label="Энергия" value={k.energy} unit="ч·Pном" />
          <Tile label="Средняя мощность" value={k.mean} />
          <Tile label="Пик" value={k.peak} />
          <Tile label="MAE выпуска" value={k.mae} />
          <Tile label="Выигрыш у базы" value={k.skill} tone={k.tone} />
        </div>

        <ForecastPanel rows={rows} issueDate={issueDate}
          onIssue={(d) => d >= ISSUE_MIN && d <= ISSUE_MAX && setIssueDate(d)}
          horizon={horizon} onHorizon={setHorizon} band={band} error={forecast.error} />

        <div className="grid gap-4 min-[1000px]:grid-cols-2">
          <PowerCurvePanel data={curve.data} error={curve.error} />
          <DailyErrorPanel daily={metrics.data?.daily ?? []} turbine={turbine} error={metrics.error} />
        </div>

        <TestPeriodPanel points={timeline.data ?? []} error={timeline.error} />
      </main>

      <AgentWidget pipelineLog={log.data ?? []} onChanged={refresh} />
    </div>
  )
}

function kpis(rows: { p_hat: number; actual: number | null; baseline: number | null }[]) {
  const p = rows.map((r) => r.p_hat)
  const energy = p.reduce((a, b) => a + b, 0)
  const fact = rows.filter((r) => r.actual != null)
  const mae = fact.length ? fact.reduce((a, r) => a + Math.abs(r.actual! - r.p_hat), 0) / fact.length : null
  const base = fact.filter((r) => r.baseline != null)
  const maeB = base.length ? base.reduce((a, r) => a + Math.abs(r.actual! - r.baseline!), 0) / base.length : null
  const skill = mae != null && maeB ? 1 - mae / maeB : null
  const tone: Tone = skill == null ? 'neutral' : skill > 0 ? 'good' : 'warn'
  return {
    energy: p.length ? energy.toFixed(1) : '—',
    mean: p.length ? pct(energy / p.length) : '—',
    peak: p.length ? pct(Math.max(...p)) : '—',
    mae: mae != null ? mae.toFixed(3) : '—',
    skill: skill != null ? `${skill > 0 ? '+' : ''}${pct(skill)}` : '—',
    tone,
  }
}
