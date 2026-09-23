import {
  Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { ForecastRow } from '../api/types'
import { pct, shortTime, toLocal } from '../lib/format'

const C = { acc: '#76b900', sky: '#38bdf8', warn: '#f5b83d', mute: '#8391a0', line: '#1f2833', wind: '#334155' }

export function ForecastChart({ rows, band }: { rows: ForecastRow[]; band: (lead: number) => number }) {
  const data = rows.map((r) => ({
    t: shortTime(r.target_time),
    local: toLocal(r.target_time),
    p: r.p_hat,
    range: [Math.max(0, r.p_hat - band(r.lead_hours)), Math.min(1, r.p_hat + band(r.lead_hours))],
    curve: r.p_curve,
    actual: r.actual,
    baseline: r.baseline,
    wind: r.v_eq,
  }))
  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="gBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.acc} stopOpacity={0.28} />
              <stop offset="100%" stopColor={C.acc} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.line} strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="t" tick={{ fill: C.mute, fontSize: 11 }} tickLine={false} axisLine={{ stroke: C.line }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis yAxisId="p" domain={[0, 1]} tickFormatter={(v) => pct(v)} tick={{ fill: C.mute, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="w" orientation="right" domain={[0, 'dataMax + 2']} tick={{ fill: C.mute, fontSize: 11 }} tickLine={false} axisLine={false} unit=" м/с" width={56} />
          <Tooltip content={<Tip />} cursor={{ stroke: C.acc, strokeOpacity: 0.4 }} />
          <Legend wrapperStyle={{ fontSize: 12, color: C.mute, paddingTop: 8 }} />
          <Bar yAxisId="w" dataKey="wind" name="Ветер 100 м (прогноз, v_eq)" fill={C.wind} opacity={0.55} radius={[3, 3, 0, 0]} animationDuration={700} />
          <Area yAxisId="p" dataKey="range" name="Коридор ±MAE бэктеста" stroke="none" fill="url(#gBand)" animationDuration={900} />
          <Line yAxisId="p" dataKey="curve" name="Кривая мощности" stroke={C.mute} strokeDasharray="5 5" dot={false} strokeWidth={1.5} animationDuration={900} />
          <Line yAxisId="p" dataKey="baseline" name="Персистентность" stroke={C.warn} strokeDasharray="2 4" dot={false} strokeWidth={1.2} animationDuration={900} />
          <Line yAxisId="p" dataKey="actual" name="Факт" stroke={C.sky} dot={false} strokeWidth={2} connectNulls={false} animationDuration={1100} />
          <Line yAxisId="p" dataKey="p" name="Прогноз агента" stroke={C.acc} dot={false} strokeWidth={3} animationDuration={1200}
            activeDot={{ r: 5, fill: C.acc, stroke: '#07090c', strokeWidth: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

interface TipProps { active?: boolean; payload?: { payload: Record<string, number | string | null> }[] }
function Tip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const row = (k: string, v: string, color: string) => (
    <div className="flex items-center justify-between gap-6"><span className="flex items-center gap-2 text-mute"><i className="size-2 rounded-full" style={{ background: color }} />{k}</span><b className="tabular">{v}</b></div>
  )
  return (
    <div className="glass min-w-52 space-y-1 p-3 text-xs shadow-2xl">
      <div className="mb-1 font-medium">{d.t} UTC <span className="text-mute">· {d.local} Алматы</span></div>
      {row('Прогноз', pct(d.p as number, 1), C.acc)}
      {d.actual != null && row('Факт', pct(d.actual as number, 1), C.sky)}
      {d.curve != null && row('Кривая', pct(d.curve as number, 1), C.mute)}
      {d.baseline != null && row('Персист.', pct(d.baseline as number, 1), C.warn)}
      {d.wind != null && row('Ветер', `${(d.wind as number).toFixed(1)} м/с`, C.wind)}
    </div>
  )
}
