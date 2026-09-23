import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { TimelinePoint } from '../api/types'
import { Empty, Panel, Problem } from '../components/ui/Panel'
import { ddmm, pct } from '../lib/format'

const MUTE = '#8b949e', LINE = '#30363d', BLUE = '#58a6ff'

export function TestPeriodPanel({ points, error }: { points: TimelinePoint[]; error: string | null }) {
  const data = points.filter((p) => p.issue_date >= '2026-01-31').map((p) => ({ t: p.target_time, p: p.p_hat }))
  const ticks = data.filter((_, i) => i % (24 * 5) === 0).map((d) => d.t)
  return (
    <Panel delay={500} title="Тестовый период · февраль" controls={
      <a href={api.exportCsvUrl} className="rounded-lg border border-line px-3 py-1.5 text-sm text-blue hover:border-blue">forecasts.csv</a>}>
      {error ? <Problem>Период не загрузился: {error}</Problem> : !data.length ? <Empty>Прогнозов на февраль нет.</Empty> : (
        <div className="h-56">
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="t" ticks={ticks} tickFormatter={ddmm} tick={{ fill: MUTE, fontSize: 13 }} tickLine={false} axisLine={{ stroke: LINE }} />
              <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => pct(v)} tick={{ fill: MUTE, fontSize: 13 }} tickLine={false} axisLine={false} width={44} />
              <Area dataKey="p" stroke={BLUE} strokeWidth={2} strokeDasharray="6 4" fill={BLUE} fillOpacity={0.1} isAnimationActive animationDuration={1200} animationEasing="ease-out" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}
