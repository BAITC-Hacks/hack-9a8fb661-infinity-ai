import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { QualitySummary } from '../api/types'
import { useT } from '../lib/i18n'
import { usePalette } from '../lib/theme'

/** Пропуски факта (wind_actuals_gaps): по турбинам и по месяцам. */
export function QualityPanel({ q, error, bare }: { q: QualitySummary | null; error: string | null; bare?: boolean }) {
  const { t } = useT()
  const c = usePalette()
  return (
    <section className="panel rise" style={{ animationDelay: '450ms' }}>
      <div className="mb-3 flex items-baseline justify-between"><h2 className={`text-[16px] font-semibold ${bare ? "hidden" : ""}`}>{t('p_quality')}</h2></div>
      {error ? <p className="text-[14px] text-bad">{t('err')}: {error}</p> : !q ? <div className="shimmer h-40 rounded-lg" /> : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {q.turbines.map((x) => (
              <div key={x.turbine} className="rounded-lg border border-line bg-sunk px-3 py-2 text-[12px] text-mute">
                <div className="font-semibold text-text">{x.turbine === 'T1' ? t('t1') : t('t2')}</div>
                <div className="num">{x.count} {t('q_gaps')} · {x.hours.toFixed(0)} {t('q_hours')} · {t('q_longest')} <span className={x.longest > 24 ? 'text-warn' : ''}>{x.longest.toFixed(0)}</span></div>
              </div>))}
          </div>
          <div className="lbl mb-1">{t('q_monthly')}</div>
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={q.monthly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={c.line} strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(2).replace('-', '.')} tick={{ fill: c.mute, fontSize: 10 }} tickLine={false} axisLine={{ stroke: c.line }} interval={2} />
                <YAxis tick={{ fill: c.mute, fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip isAnimationActive={false} cursor={{ fill: `${c.blue}14` }} contentStyle={{ background: c.panel, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12, color: c.text }} formatter={(v) => `${Number(v).toFixed(0)} ${t('h_short')}`} />
                <Bar dataKey="T1" name={t('t1')} stackId="a" fill={c.blue} isAnimationActive animationDuration={800} />
                <Bar dataKey="T2" name={t('t2')} stackId="a" fill={c.curve} isAnimationActive animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  )
}
