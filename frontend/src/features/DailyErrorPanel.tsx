import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyError, TurbineId } from '../api/types'
import { Empty, Panel, Problem } from '../components/ui/Panel'
import { dayOf } from '../lib/format'

const MUTE = '#8b949e', LINE = '#30363d'

export function DailyErrorPanel({ daily, turbine, error }: { daily: DailyError[]; turbine: TurbineId; error: string | null }) {
  const data = daily.filter((d) => d.turbine === turbine)
  const ticks = data.filter((d) => Number(dayOf(d.issue_date)) % 5 === 1).map((d) => d.issue_date)
  return (
    <Panel delay={420} title="Ошибка по дням · январь" controls={
      <div className="flex gap-3 text-[13px] text-mute">
        <Sw c="#30363d" l="База" /><Sw c="#58a6ff" l="24 ч" /><Sw c="#f0883e" l="48 ч" />
      </div>}>
      {error ? <Problem>Метрики не загрузились: {error}</Problem> : !data.length ? <Empty>Нет дней с фактом.</Empty> : (
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart key={turbine} data={data} barGap={0} barCategoryGap="0%" margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="issue_date" ticks={ticks} tickFormatter={dayOf} tick={{ fill: MUTE, fontSize: 13 }} tickLine={false} axisLine={{ stroke: LINE }} />
              <YAxis tick={{ fill: MUTE, fontSize: 13 }} tickLine={false} axisLine={false} width={44} tickCount={3} />
              <Tooltip isAnimationActive={false} cursor={{ fill: 'rgba(139,148,158,.08)' }}
                contentStyle={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, fontSize: 13 }}
                formatter={(v) => Number(v).toFixed(3)} />
              <Bar dataKey="mae_base" name="База" fill="#30363d" radius={1} maxBarSize={9} isAnimationActive animationDuration={700} animationEasing="ease-out" />
              <Bar dataKey="mae_24" name="Модель 24 ч" fill="#58a6ff" radius={1} maxBarSize={9} isAnimationActive animationDuration={700} animationEasing="ease-out" />
              <Bar dataKey="mae_48" name="Модель 48 ч" fill="#f0883e" radius={1} maxBarSize={9} isAnimationActive animationDuration={700} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}

function Sw({ c, l }: { c: string; l: string }) {
  return <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: c }} />{l}</span>
}
