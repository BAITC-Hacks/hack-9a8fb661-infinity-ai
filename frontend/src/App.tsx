import { useCallback, useEffect, useState } from 'react'
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
import { LoginPage } from './pages/LoginPage'
import { DataPage } from './pages/DataPage'
import { ForecastPage } from './pages/ForecastPage'
import { MapPage } from './pages/MapPage'
import { ReplayPage } from './pages/ReplayPage'

export default function App() {
  const [user, setUser] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null))
    const h = () => setUser(null)
    window.addEventListener('unauthorized', h)
    return () => window.removeEventListener('unauthorized', h)
  }, [])
  if (user === undefined) return null
  if (user === null) return <LoginPage onLogin={setUser} />
  return <Shell user={user} onLogout={() => { api.logout().finally(() => setUser(null)) }} />
}

function Shell({ user, onLogout }: { user: string; onLogout: () => void }) {
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
  const ctxLine = objs.length ? t('ctx', { n: objs.length, mw: ratedOf('STATION'), model: objs[0].turbine_model ?? '' }) : ''

  return (
    <div className="min-h-full pl-14">
      <Sidebar onRun={run} running={running} runMsg={runMsg} />
      <TopBar ctx={ctxLine} user={user} onLogout={onLogout} />
      {page === 'forecast' && <ForecastPage ctx={ctx} />}
      {page === 'replay' && <ReplayPage ctx={ctx} />}
      {page === 'map' && <MapPage ctx={ctx} />}
      {page === 'data' && <DataPage ctx={ctx} />}
      {page === 'agent' && <AgentPage ctx={ctx} />}
      {page !== 'agent' && <AgentWidget onChanged={refresh} context={{ issue_date: issueDate, turbine }} />}
    </div>
  )
}
