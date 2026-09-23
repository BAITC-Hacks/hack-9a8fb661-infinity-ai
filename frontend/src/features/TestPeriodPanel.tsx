import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { TimelinePoint } from '../api/types'
import { ddmm } from '../lib/format'
import { useT } from '../lib/i18n'
import { usePalette } from '../lib/theme'

export function TestPeriodPanel({ points, rated, error }: { points: TimelinePoint[]; rated: number; error: string | null }) {
  const { t } = useT()
  const c = usePalette()
  const data = points.filter((p) => p.issue_date >= '2026-01-31').map((p) => ({ t: p.target_time, p: p.p_hat * rated }))
  const ticks = data.filter((_, i) => i % (24 * 5) === 0).map((d) => d.t)
  return (
    <section className="panel rise" style={{ animationDelay: '500ms' }}>
      <div className="mb-3 flex items-baseline justify-between"><h2 className="text-[16px] font-semibold">{t('p_feb')}</h2>
        <a href={api.exportCsvUrl} className="rounded-md border border-line px-2 py-1 text-[11px] text-blue hover:border-blue">forecasts.csv</a></div>
      {error ? <p className="text-[14px] text-bad">{t('err')}: {error}</p> : !data.length ? <p className="py-6 text-[14px] text-mute">{t('no_feb')}</p> : (
        <div className="h-52">
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={c.line} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="t" ticks={ticks} tickFormatter={ddmm} tick={{ fill: c.mute, fontSize: 12 }} tickLine={false} axisLine={{ stroke: c.line }} />
              <YAxis domain={[0, rated]} tick={{ fill: c.mute, fontSize: 12 }} tickLine={false} axisLine={false} />
              <Area dataKey="p" stroke={c.blue} strokeWidth={2} strokeDasharray="6 4" fill={c.blue} fillOpacity={0.1} isAnimationActive animationDuration={1200} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
