import { useCallback, useState } from 'react'
import { api } from './api/client'
import type { TurbineId } from './api/types'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { AgentWidget } from './features/AgentWidget'
import { useAsync } from './hooks/useAsync'
import type { Ctx } from './lib/ctx'
import { useT } from './lib/i18n'
import { usePage } from './lib/router'
import { AgentPage } from './pages/AgentPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { ForecastPage } from './pages/ForecastPage'
import { MapPage } from './pages/MapPage'

export default function App() {
  const { t } = useT()
  const page = usePage()
  const [turbine, setTurbine] = useState<TurbineId>('STATION')
  const [issueDate, setIssueDate] = useState('2026-01-31')
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((x) => x + 1), [])
  const objects = useAsync(api.objects, [])
  const health = useAsync(api.health, [])
  const objs = objects.data ?? []
  const ratedOf = (id: TurbineId) => id === 'STATION'
    ? (objs.length ? objs.reduce((a, o) => a + (o.rated_power_mw ?? 2.5), 0) : 5)
    : objs.find((o) => o.object_id === (id === 'T1' ? 1 : 2))?.rated_power_mw ?? 2.5

  const run = async () => {
    setRunning(true)
    try { const r = await api.run(issueDate); setRunMsg(`${t('done')}: ${r.status}`); refresh() }
    catch (e) { setRunMsg(`${t('err')}: ${(e as Error).message}`) }
    finally { setRunning(false) }
  }
  const ctx: Ctx = { turbine, setTurbine, issueDate, setIssueDate, tick, refresh, objs, ratedOf, llm: health.data?.llm ?? '…' }
  const ctxLine = t('ctx', { n: objs.length || 2, mw: ratedOf('STATION'), model: objs[0]?.turbine_model ?? 'Goldwind GW109/2500' })

  return (
    <div className="min-h-full pl-14">
      <Sidebar onRun={run} running={running} runMsg={runMsg} />
      <TopBar ctx={ctxLine} />
      {page === 'forecast' && <ForecastPage ctx={ctx} />}
      {page === 'map' && <MapPage ctx={ctx} />}
      {page === 'analytics' && <AnalyticsPage ctx={ctx} />}
      {page === 'agent' && <AgentPage ctx={ctx} />}
      {page !== 'agent' && <AgentWidget onChanged={refresh} />}
    </div>
  )
}
