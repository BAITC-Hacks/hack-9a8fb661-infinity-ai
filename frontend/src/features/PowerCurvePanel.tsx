import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, XAxis, YAxis } from 'recharts'
import type { PowerCurve } from '../api/types'
import { Empty, Panel, Problem } from '../components/ui/Panel'
import { pct } from '../lib/format'

const MUTE = '#8b949e', LINE = '#30363d', CURVE = '#a371f7'

export function PowerCurvePanel({ data, error }: { data: PowerCurve | null; error: string | null }) {
  return (
    <Panel delay={350} title="Кривая мощности" controls={data && <span className="num text-[13px] text-mute">{data.n_hours.toLocaleString('ru')} ч истории</span>}>
      {error ? <Problem>Кривая не загрузилась: {error}</Problem> : !data ? <Empty>Считаю кривую…</Empty> : (
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart key={data.turbine} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={LINE} strokeDasharray="4 4" vertical={false} />
              <XAxis type="number" dataKey="v" domain={[0, 25]} ticks={[0, 5, 10, 15, 20, 25]} allowDataOverflow
                tick={{ fill: MUTE, fontSize: 13 }} tickLine={false} axisLine={{ stroke: LINE }}
                label={{ value: 'м/с', position: 'insideBottomRight', offset: -2, fill: MUTE, fontSize: 12 }} />
              <YAxis type="number" dataKey="p" domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => pct(v)}
                tick={{ fill: MUTE, fontSize: 13 }} tickLine={false} axisLine={false} width={44} />
              <Scatter data={data.points} isAnimationActive={false}
                shape={(props: { cx?: number; cy?: number }) => <circle cx={props.cx} cy={props.cy} r={1.3} fill={MUTE} fillOpacity={0.35} />} />
              <Line data={data.curve} dataKey="p" stroke={CURVE} strokeWidth={2.5} dot={false} isAnimationActive animationDuration={1000} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}
