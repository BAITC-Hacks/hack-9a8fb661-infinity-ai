import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ForecastRow } from '../api/types'
import { Empty, Panel, Problem } from '../components/ui/Panel'
import { Segmented } from '../components/ui/Segmented'
import { ddmm, hhmm, localHour, pct, ruDate } from '../lib/format'

const BLUE = '#58a6ff', WHITE = '#e6edf3', MUTE = '#8b949e', LINE = '#30363d'
export const ISSUE_MIN = '2026-01-01'
export const ISSUE_MAX = '2026-02-27'

interface Props {
  animKey: string
  rows: ForecastRow[]
  issueDate: string
  onIssue: (d: string) => void
  horizon: 24 | 48
  onHorizon: (h: 24 | 48) => void
  band: (lead: number) => number
  error: string | null
}

export function ForecastPanel({ animKey, rows, issueDate, onIssue, horizon, onHorizon, band, error }: Props) {
  const data = rows.map((r, i) => ({
    i, t: r.target_time, p: r.p_hat, actual: r.actual,
    range: [Math.max(0, r.p_hat - band(r.lead_hours)), Math.min(1, r.p_hat + band(r.lead_hours))],
  }))
  const ticks = data.filter((d) => localHour(d.t) % 6 === 0).map((d) => d.i)
  const fact = rows.filter((r) => r.actual != null)
  const mae = fact.length ? fact.reduce((a, r) => a + Math.abs(r.actual! - r.p_hat), 0) / fact.length : null

  return (
    <Panel delay={250} title="Прогноз и факт" controls={<>
      <input type="date" className="field num" value={issueDate} min={ISSUE_MIN} max={ISSUE_MAX}
        onChange={(e) => e.target.value && onIssue(e.target.value)} />
      <Segmented value={horizon} onChange={onHorizon} options={[{ value: 24, label: '24 ч' }, { value: 48, label: '48 ч' }]} />
    </>}>
      {error ? <Problem>Прогноз не загрузился: {error}</Problem> : !rows.length ? <Empty>На эту дату прогноза нет.</Empty> : (
        <>
          <div className="h-80">
            <ResponsiveContainer>
              <ComposedChart key={animKey} data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={LINE} strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="i" ticks={ticks} tickFormatter={(i) => hhmm(data[i].t)} tick={{ fill: MUTE, fontSize: 13 }}
                  tickLine={false} axisLine={{ stroke: LINE }} />
                <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => pct(v)} tick={{ fill: MUTE, fontSize: 13 }}
                  tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<Tip data={data} />} cursor={{ stroke: LINE }} isAnimationActive={false} />
                <Area dataKey="range" stroke="none" fill={BLUE} fillOpacity={0.18} isAnimationActive animationDuration={900} animationEasing="ease-out" />
                <Line dataKey="actual" stroke={WHITE} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive animationDuration={900} animationEasing="ease-out" />
                <Line dataKey="p" stroke={BLUE} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive animationDuration={900} animationEasing="ease-out" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-mute">
            <Key color={WHITE} label="Факт" />
            <Key color={BLUE} dashed label="Прогноз" />
            <Key color={BLUE} fill label="Интервал ±MAE" />
            <span className="num ml-auto">
              Выпуск {ruDate(issueDate)} · {horizon} ч · {mae != null ? `MAE ${mae.toFixed(3)}` : 'факт ещё не наступил'}
            </span>
          </div>
        </>
      )}
    </Panel>
  )
}

function Key({ color, label, dashed, fill }: { color: string; label: string; dashed?: boolean; fill?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      {fill ? <i className="h-2.5 w-5 rounded-sm" style={{ background: color, opacity: 0.18 }} />
        : <i className="h-0 w-5" style={{ borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }} />}
      {label}
    </span>
  )
}

interface TipProps { active?: boolean; label?: number; data: { t: string; p: number; actual: number | null }[] }
function Tip({ active, label, data }: TipProps) {
  if (!active || label == null) return null
  const d = data[label]
  return (
    <div className="num rounded-lg border border-line bg-bg px-3 py-2 text-[13px]">
      <div className="text-mute">{ddmm(d.t)} {hhmm(d.t)}</div>
      <div className="text-blue">Прогноз {pct(d.p, 1)}</div>
      <div>Факт {d.actual != null ? pct(d.actual, 1) : '—'}</div>
    </div>
  )
}
