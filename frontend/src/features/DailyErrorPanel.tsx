import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyError, TurbineId } from '../api/types'
import { dayOf } from '../lib/format'
import { useT } from '../lib/i18n'
import { usePalette } from '../lib/theme'

export function DailyErrorPanel({ daily, turbine, error }: { daily: DailyError[]; turbine: TurbineId; error: string | null }) {
  const { t } = useT()
  const c = usePalette()
  const data = daily.filter((d) => d.turbine === turbine)
  const ticks = data.filter((d) => Number(dayOf(d.issue_date)) % 5 === 1).map((d) => d.issue_date)
  const Sw = ({ col, l }: { col: string; l: string }) => <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: col }} />{l}</span>
  return (
    <section className="panel rise" style={{ animationDelay: '400ms' }}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-[16px] font-semibold">{t('p_daily')}</h2>
        <div className="flex gap-3 text-[12px] text-mute"><Sw col={c.base} l={t('base')} /><Sw col={c.blue} l={t('h24')} /><Sw col={c.warn} l={t('h48')} /></div></div>
      {error ? <p className="text-[14px] text-bad">{t('err')}: {error}</p> : !data.length ? <p className="py-6 text-[14px] text-mute">{t('no_days')}</p> : (
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart key={turbine} data={data} barGap={0} barCategoryGap="0%" margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={c.line} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="issue_date" ticks={ticks} tickFormatter={dayOf} tick={{ fill: c.mute, fontSize: 12 }} tickLine={false} axisLine={{ stroke: c.line }} />
              <YAxis tick={{ fill: c.mute, fontSize: 12 }} tickLine={false} axisLine={false} tickCount={3} />
              <Tooltip isAnimationActive={false} cursor={{ fill: `${c.blue}14` }} contentStyle={{ background: c.panel, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12, color: c.text }} formatter={(v) => Number(v).toFixed(3)} />
              <Bar dataKey="mae_base" name={t('base')} fill={c.base} radius={1} maxBarSize={9} isAnimationActive animationDuration={700} />
              <Bar dataKey="mae_24" name={t('h24')} fill={c.blue} radius={1} maxBarSize={9} isAnimationActive animationDuration={700} />
              <Bar dataKey="mae_48" name={t('h48')} fill={c.warn} radius={1} maxBarSize={9} isAnimationActive animationDuration={700} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
