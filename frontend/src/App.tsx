import { AnimatePresence, motion } from 'motion/react'
import { BarChart3, Bot, CalendarRange, LineChart, ListTree, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api/client'
import type { TurbineId } from './api/types'
import { Card, CardTitle } from './components/ui/Card'
import { Skeleton } from './components/ui/Skeleton'
import { StatusBadge } from './components/ui/StatusBadge'
import { Sidebar } from './components/layout/Sidebar'
import { AgentChat } from './features/AgentChat'
import { AgentTimeline } from './features/AgentTimeline'
import { BacktestPanel } from './features/BacktestPanel'
import { ForecastChart } from './features/ForecastChart'
import { KpiRow } from './features/KpiRow'
import { TestPeriodPanel } from './features/TestPeriodPanel'
import { useAsync } from './hooks/useAsync'

type Tab = 'log' | 'chat' | 'bt' | 'feb'
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'log', label: 'Журнал агента', icon: <ListTree size={15} /> },
  { id: 'chat', label: 'Спросить агента', icon: <Bot size={15} /> },
  { id: 'bt', label: 'Бэктест · январь', icon: <BarChart3 size={15} /> },
  { id: 'feb', label: 'Тестовый период · февраль', icon: <CalendarRange size={15} /> },
]

export default function App() {
  const [turbine, setTurbine] = useState<TurbineId>('STATION')
  const [horizon, setHorizon] = useState<24 | 48>(48)
  const [issueDate, setIssueDate] = useState('')
  const [tab, setTab] = useState<Tab>('log')
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const health = useAsync(api.health, [])
  const issues = useAsync(api.issues, [tick])
  const metrics = useAsync(api.metrics, [tick])
  const forecast = useAsync(() => (issueDate ? api.forecast(issueDate, turbine) : Promise.resolve(null)), [issueDate, turbine, tick])
  const log = useAsync(() => (issueDate ? api.log(issueDate) : Promise.resolve([])), [issueDate, tick])
  const timeline = useAsync(() => api.timeline(turbine), [turbine, tick])

  useEffect(() => {
    if (!issueDate && issues.data?.length) {
      const first = issues.data.find((r) => r.issue_date === '2026-01-31') ?? issues.data[0]
      setIssueDate(first.issue_date)
    }
  }, [issues.data, issueDate])

  const rows = useMemo(() => (forecast.data?.rows ?? []).filter((r) => r.lead_hours <= horizon), [forecast.data, horizon])
  const band = useCallback((lead: number) => {
    const b = lead <= 24 ? '1-24h' : '25-48h'
    return metrics.data?.by_turbine_and_horizon.find((m) => m.turbine === turbine && m.bucket === b)?.mae ?? 0.15
  }, [metrics.data, turbine])

  const run = async () => {
    if (!issueDate) return
    setRunning(true); setRunMsg(null)
    try {
      const r = await api.run(issueDate)
      setRunMsg(`Готово · run ${r.id} · ${r.status}`)
      refresh()
    } catch (e) {
      setRunMsg(`Ошибка: ${(e as Error).message}`)
    } finally { setRunning(false) }
  }

  const noData = !issues.loading && !issues.data?.length

  return (
    <div className="min-h-full lg:flex">
      <Sidebar issues={issues.data ?? []} issueDate={issueDate} onIssue={setIssueDate} turbine={turbine} onTurbine={setTurbine}
        horizon={horizon} onHorizon={setHorizon} onRun={run} running={running} runMsg={runMsg} health={health.data} />

      <main className="min-w-0 flex-1 space-y-5 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <motion.h1 key={issueDate} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Прогноз выработки <span className="text-acc">{turbine === 'STATION' ? 'станции' : turbine}</span>
            </motion.h1>
            <p className="mt-1 text-sm text-mute">Выпуск {issueDate || '…'} 00:00 UTC · горизонт {horizon} ч · архивные прогнозы Open-Meteo, доступные на момент выпуска</p>
          </div>
          {forecast.data && <StatusBadge status={forecast.data.run.status} mode={forecast.data.run.mode} />}
        </header>

        {noData && (
          <Card><p className="text-sm text-warn">В хранилище нет прогнозов. Запустите бэктест: <code className="font-mono">python -m app.cli backtest</code></p></Card>
        )}
        {(issues.error || forecast.error) && <Card><p className="text-sm text-bad">Ошибка API: {issues.error || forecast.error}</p></Card>}

        <KpiRow rows={rows} />

        <Card delay={0.1}>
          <CardTitle icon={<LineChart size={16} />} title="Почасовой прогноз мощности" right="доля номинальной мощности · UTC" />
          {forecast.loading && !forecast.data ? <Skeleton className="h-[360px]" /> : <ForecastChart rows={rows} band={band} />}
        </Card>

        <AnimatePresence mode="wait">
          {forecast.data?.run.summary && (
            <motion.div key={forecast.data.run.id + turbine} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="glass relative overflow-hidden border-l-4 border-l-acc p-5">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-acc"><Sparkles size={14} />Вывод агента</div>
              <p className="text-sm leading-relaxed text-text/90">{forecast.data.run.summary}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <nav className="flex flex-wrap gap-1 rounded-2xl border border-line bg-panel/60 p-1 backdrop-blur">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? 'text-bg' : 'text-mute hover:text-text'}`}>
              {tab === t.id && <motion.span layoutId="tab-pill" className="absolute inset-0 -z-0 rounded-xl bg-acc" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <span className="relative z-10 flex items-center gap-2">{t.icon}{t.label}</span>
            </button>
          ))}
        </nav>

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
            <Card className="scroll-thin">
              {tab === 'log' && (log.data ? <AgentTimeline entries={log.data} /> : <Skeleton />)}
              {tab === 'chat' && <AgentChat onChanged={refresh} />}
              {tab === 'bt' && (metrics.data ? <BacktestPanel m={metrics.data} /> : <Skeleton />)}
              {tab === 'feb' && (timeline.data ? <TestPeriodPanel points={timeline.data} /> : <Skeleton />)}
            </Card>
          </motion.div>
        </AnimatePresence>

        <footer className="pb-4 text-center text-xs text-mute/70">Infinity AI · HackAlem AI 2026 · трек «Энергетика»</footer>
      </main>
    </div>
  )
}
