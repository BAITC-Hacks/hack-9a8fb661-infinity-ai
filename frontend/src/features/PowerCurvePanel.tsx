import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, XAxis, YAxis } from 'recharts'
import type { PowerCurve } from '../api/types'
import { pct } from '../lib/format'
import { useT } from '../lib/i18n'
import { usePalette } from '../lib/theme'

export function PowerCurvePanel({ data, error }: { data: PowerCurve | null; error: string | null }) {
  const { t } = useT()
  const c = usePalette()
  return (
    <section className="panel rise" style={{ animationDelay: '350ms' }}>
      <div className="mb-3 flex items-baseline justify-between"><h2 className="text-[16px] font-semibold">{t('p_curve')}</h2>
        {data && <span className="mono num text-mute">{data.n_hours.toLocaleString('ru')} {t('hours_hist')}</span>}</div>
      {error ? <p className="text-[14px] text-bad">{t('err')}: {error}</p> : !data ? <div className="shimmer h-64 rounded-lg" /> : (
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart key={data.turbine} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={c.line} strokeDasharray="4 4" vertical={false} />
              <XAxis type="number" dataKey="v" domain={[0, 25]} ticks={[0, 5, 10, 15, 20, 25]} allowDataOverflow tick={{ fill: c.mute, fontSize: 12 }} tickLine={false} axisLine={{ stroke: c.line }}
                label={{ value: 'м/с', position: 'insideBottomRight', offset: -2, fill: c.mute, fontSize: 11 }} />
              <YAxis type="number" dataKey="p" domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => pct(v)} tick={{ fill: c.mute, fontSize: 12 }} tickLine={false} axisLine={false} />
              <Scatter data={data.points} isAnimationActive={false} shape={(pr: { cx?: number; cy?: number }) => <circle cx={pr.cx} cy={pr.cy} r={1.3} fill={c.mute} fillOpacity={0.35} />} />
              <Line data={data.curve} dataKey="p" stroke={c.curve} strokeWidth={2.5} dot={false} isAnimationActive animationDuration={1000} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
