import { useCallback, useMemo, useState } from 'react'
import { api } from './api/client'
import type { TurbineId } from './api/types'
import { FilterBar, type Mode, type View } from './components/layout/FilterBar'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { AgentWidget } from './features/AgentWidget'
import { ChartPanel } from './features/ChartPanel'
import { DailyErrorPanel } from './features/DailyErrorPanel'
import { KpiStrip } from './features/KpiStrip'
import { PassportCard } from './features/PassportCard'
import { PowerCurvePanel } from './features/PowerCurvePanel'
import { QualityPanel } from './features/QualityPanel'
import { SiteMap } from './features/SiteMap'
import { TestPeriodPanel } from './features/TestPeriodPanel'
import { WhyCard } from './features/WhyCard'
import { useAsync } from './hooks/useAsync'
import { kpis } from './lib/calc'
import { useT } from './lib/i18n'

export default function App() {
  const { t } = useT()
  const [turbine, setTurbine] = useState<TurbineId>('STATION')
  const [horizon, setHorizon] = useState<24 | 48>(48)
  const [issueDate, setIssueDate] = useState('2026-01-31')
  const [view, setView] = useState<View>('chart')
  const [mode, setMode] = useState<Mode>('eval')
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((x) => x + 1), [])

  const objects = useAsync(api.objects, [])
  const metrics = useAsync(api.metrics, [tick])
  const quality = useAsync(api.quality, [])
  const weather = useAsync(() => api.weather(issueDate), [issueDate])
  const passport = useAsync(() => api.passport(issueDate), [issueDate, tick])
  const all = useAsync(() => Promise.all((['STATION', 'T1', 'T2'] as TurbineId[]).map((id) => api.forecast(issueDate, id))), [issueDate, tick])
  const log = useAsync(() => api.log(issueDate), [issueDate, tick])
  const timeline = useAsync(() => api.timeline(turbine), [turbine, tick])
  const curve = useAsync(() => api.powerCurve(turbine), [turbine])

  const objs = objects.data ?? []
  const ratedOf = (id: TurbineId) => id === 'STATION'
    ? (objs.length ? objs.reduce((a, o) => a + (o.rated_power_mw ?? 2.5), 0) : 5)
    : objs.find((o) => o.object_id === (id === 'T1' ? 1 : 2))?.rated_power_mw ?? 2.5
  const rated = ratedOf(turbine)
  const current = (all.data ?? [])[(['STATION', 'T1', 'T2'] as TurbineId[]).indexOf(turbine)] ?? null
  const rows = useMemo(() => (current?.rows ?? []).filter((r) => r.lead_hours <= horizon), [current, horizon])
  const band = useCallback((lead: number) => metrics.data?.by_turbine_and_horizon.find((m) => m.turbine === turbine && m.bucket === (lead <= 24 ? '1-24h' : '25-48h'))?.mae ?? 0.15, [metrics.data, turbine])
  const k = kpis(rows, rated)
  const peakWx = useMemo(() => (weather.data ?? []).find((w) => w.time === k.peakTime) ?? null, [weather.data, k.peakTime])

  const run = async () => {
    setRunning(true)
    try { const r = await api.run(issueDate); setRunMsg(`${t('done')}: ${r.status}`); refresh() }
    catch (e) { setRunMsg(`${t('err')}: ${(e as Error).message}`) }
    finally { setRunning(false) }
  }
  const ctx = t('ctx', { n: objs.length || 2, mw: ratedOf('STATION'), model: objs[0]?.turbine_model ?? 'Goldwind GW109/2500' })

  return (
    <div className="min-h-full pl-14">
      <Sidebar onRun={run} running={running} runMsg={runMsg} onAgent={() => window.dispatchEvent(new Event('open-agent'))} />
      <TopBar ctx={ctx} />
      <FilterBar turbine={turbine} onTurbine={setTurbine} horizon={horizon} onHorizon={setHorizon} issueDate={issueDate} onIssue={setIssueDate} view={view} onView={setView} mode={mode} onMode={setMode} />
      <KpiStrip k={k} showFact={mode === 'eval'} />

      <main className="space-y-4 p-4">
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <ChartPanel rows={rows} weather={weather.data ?? []} rated={rated} turbine={turbine} issueDate={issueDate} horizon={horizon}
            view={view} loading={all.loading} error={all.error} band={band} showFact={mode === 'eval'} prevRows={passport.data?.diff_vs_previous?.prev_rows ?? []} />
          <div className="space-y-4">
            <PassportCard p={passport.data} error={passport.error} />
            <WhyCard rows={rows} weather={weather.data ?? []} run={current?.run ?? null} log={log.data ?? []} />
          </div>
        </div>

        <SiteMap objects={objs} wind={peakWx?.wind_speed_100m ?? null} direction={peakWx?.wind_direction_100m ?? null} power={k.peakMw == null ? null : k.peakMw / rated} />

        <div className="grid gap-4 min-[1000px]:grid-cols-3">
          <PowerCurvePanel data={curve.data} error={curve.error} />
          <DailyErrorPanel daily={metrics.data?.daily ?? []} turbine={turbine} error={metrics.error} />
          <QualityPanel q={quality.data} error={quality.error} />
        </div>
        <TestPeriodPanel points={timeline.data ?? []} rated={rated} error={timeline.error} />
        <footer className="pb-2 text-center text-[11px] text-mute">{t('footer')}</footer>
      </main>

      <AgentWidget onChanged={refresh} />
    </div>
  )
}
