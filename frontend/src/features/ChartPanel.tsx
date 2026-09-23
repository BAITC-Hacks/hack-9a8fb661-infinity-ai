import { Download, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ForecastRow, TurbineId, WeatherPoint } from '../api/types'
import { devTone, fmt, TOL_PCT } from '../lib/calc'
import { ddmm, hhmm, ruDate } from '../lib/format'
import { useT } from '../lib/i18n'
import { usePalette } from '../lib/theme'
import type { View } from '../components/layout/FilterBar'

interface Props {
  rows: ForecastRow[]; weather: WeatherPoint[]; rated: number; turbine: TurbineId
  issueDate: string; horizon: number; view: View; loading: boolean; error: string | null; band: (lead: number) => number
}

/** Панель 44px (крошки, допуск, пик, экспорт) + график с зумом | таблица + строка погоды по часам. */
export function ChartPanel(p: Props) {
  const { t } = useT()
  const c = usePalette()
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null)

  const data = useMemo(() => {
    const w = new Map(p.weather.map((x) => [x.time, x]))
    return p.rows.map((r, i) => {
      const wx = w.get(r.target_time)
      const fcMw = r.p_hat * p.rated, factMw = r.actual == null ? null : r.actual * p.rated
      return {
        i, time: r.target_time, fc: fcMw, fact: factMw,
        band: [Math.max(0, r.p_hat - p.band(r.lead_hours)) * p.rated, Math.min(1, r.p_hat + p.band(r.lead_hours)) * p.rated],
        dev: factMw == null ? null : fcMw - factMw, devPct: r.actual == null ? null : (r.p_hat - r.actual) * 100,
        wind: wx?.wind_speed_100m ?? null, gust: wx?.wind_gusts_10m ?? null, temp: wx?.temperature_2m ?? null,
      }
    })
  }, [p.rows, p.weather, p.rated, p.band])
  const shown = zoom ? data.slice(zoom[0], zoom[1] + 1) : data
  const iPeak = data.length ? data.map((d) => d.fc).indexOf(Math.max(...data.map((d) => d.fc))) : -1
  const ticks = shown.filter((d) => new Date(d.time).getUTCHours() % 6 === 1).map((d) => d.i)
  const strip = shown.filter((d) => new Date(d.time).getUTCHours() % 3 === 1)
  const crumbs = [t('root'), t('station'), p.turbine === 'STATION' ? null : p.turbine === 'T1' ? t('t1') : t('t2')].filter(Boolean) as string[]

  const exportCsv = () => {
    const head = `# ${t('station')} · ${p.turbine} · ${t('f_issue')} ${p.issueDate} · ${p.horizon}h · Open-Meteo previous runs\n`
    const cols = ['time_utc', 'forecast_mw', 'fact_mw', 'deviation_mw', 'deviation_pct', 'wind_100m_ms', 'gust_10m_ms', 'temp_c']
    const body = data.map((d) => [d.time, fmt(d.fc, 3), fmt(d.fact, 3), fmt(d.dev, 3), fmt(d.devPct, 1), fmt(d.wind, 1), fmt(d.gust, 1), fmt(d.temp, 1)].join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([head + cols.join(',') + '\n' + body], { type: 'text/csv;charset=utf-8' }))
    a.download = `forecast_${p.turbine}_${p.issueDate}_${p.horizon}h.csv`; a.click()
  }

  return (
    <section id="forecast" className="panel !p-0">
      <div className="flex h-[44px] items-center gap-3 border-b border-line bg-sunk px-3">
        <span className="mono truncate">
          {crumbs.map((x, i) => <span key={x}>{i > 0 && <span className="text-mute"> / </span>}<span className={i === crumbs.length - 1 ? 'text-blue' : 'text-mute'}>{x}</span></span>)}
        </span>
        <span className="mono ml-auto hidden text-mute lg:inline">
          {t('tol', { tol: TOL_PCT })} · {iPeak >= 0 ? t('peak', { mw: data[iPeak].fc.toFixed(2), t: hhmm(data[iPeak].time) }) : '—'}
        </span>
        {p.loading && <Loader2 size={14} className="animate-spin text-mute" />}
        {zoom && <button onClick={() => setZoom(null)} className="rounded-md border border-line px-2 py-1 text-[11px] text-mute hover:text-text">{t('reset_zoom')}</button>}
        <button onClick={exportCsv} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-mute hover:border-blue hover:text-text"><Download size={12} />{t('export')}</button>
      </div>

      {p.error ? <State color="text-bad">{t('err')}: {p.error}</State>
        : p.loading && !p.rows.length ? <State color="text-mute"><Loader2 className="mb-2 animate-spin" />{t('loading')}</State>
        : !p.rows.length ? <State color="text-mute">{t('nodata')}</State>
        : p.view === 'table' ? (
          <div className="scroll-thin max-h-[460px] overflow-auto">
            <table className="num w-full text-[13px]">
              <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-mute">
                <tr>{[t('th_time'), t('th_forecast'), t('th_fact'), t('th_dev'), t('th_devp'), t('th_wind'), t('th_temp')].map((h, i) =>
                  <th key={h} className={`border-b border-line px-3 py-2 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.map((d) => {
                  const tone = devTone(d.devPct)
                  return (
                    <tr key={d.i} className={`border-b border-line/60 ${tone === 'warn' ? 'bg-warn/10' : tone === 'bad' ? 'bg-bad/10' : ''}`}>
                      <td className="px-3 py-1.5 text-left">{ddmm(d.time)} {hhmm(d.time)}</td>
                      <td className="px-3 text-right text-blue">{fmt(d.fc, 2)}</td>
                      <td className="px-3 text-right text-data">{fmt(d.fact, 2)}</td>
                      <td className="px-3 text-right">{d.dev == null ? '—' : `${d.dev > 0 ? '+' : ''}${d.dev.toFixed(2)}`}</td>
                      <td className={`px-3 text-right ${tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : ''}`}>{d.devPct == null ? '—' : `${d.devPct > 0 ? '+' : ''}${d.devPct.toFixed(1)}`}</td>
                      <td className="px-3 text-right text-mute">{fmt(d.wind, 1)}</td>
                      <td className="px-3 text-right text-mute">{fmt(d.temp, 1)}</td>
                    </tr>)
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-3">
            <div className="mb-1 flex items-center gap-4 text-[12px] text-mute">
              <span className="flex items-center gap-1.5"><i className="h-[3px] w-4 rounded" style={{ background: c.blue }} />{t('k_forecast')}</span>
              <span className="flex items-center gap-1.5"><i className="h-[3px] w-4 rounded" style={{ background: c.data }} />{t('k_fact')}</span>
              <span className="num ml-auto">{t('f_issue')} {ruDate(p.issueDate)} · {p.horizon} h · {t('mw')}</span>
            </div>
            <div className="h-[340px] select-none">
              <ResponsiveContainer>
                <ComposedChart key={`${p.issueDate}${p.turbine}${p.horizon}`} data={shown} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}
                  onMouseDown={(e) => e?.activeLabel != null && setSel({ a: Number(e.activeLabel), b: Number(e.activeLabel) })}
                  onMouseMove={(e) => sel && e?.activeLabel != null && setSel({ a: sel.a, b: Number(e.activeLabel) })}
                  onMouseUp={() => { if (sel && Math.abs(sel.b - sel.a) >= 2) setZoom([Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)]); setSel(null) }}>
                  <defs>
                    <linearGradient id="gFc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.blue} stopOpacity={0.35} /><stop offset="100%" stopColor={c.blue} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={c.line} strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="i" type="number" domain={['dataMin', 'dataMax']} ticks={ticks} tickFormatter={(i) => (data[i] ? hhmm(data[i].time) : '')}
                    tick={{ fill: c.mute, fontSize: 12 }} tickLine={false} axisLine={{ stroke: c.line }} />
                  <YAxis domain={[0, p.rated]} tick={{ fill: c.mute, fontSize: 12 }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip content={<Tip c={c} t={t} />} cursor={{ stroke: c.blue, strokeOpacity: 0.5 }} isAnimationActive={false} />
                  <Area dataKey="band" stroke="none" fill={c.blue} fillOpacity={0.07} isAnimationActive animationDuration={800} />
                  <Area dataKey="fc" stroke="none" fill="url(#gFc)" isAnimationActive animationDuration={900} />
                  <Line dataKey="fc" stroke={c.blue} strokeWidth={2.5} dot={false} type="monotone" isAnimationActive animationDuration={900}
                    activeDot={{ r: 4, fill: c.blue, stroke: c.panel, strokeWidth: 2 }} />
                  <Line dataKey="fact" stroke={c.data} strokeWidth={2.5} dot={false} type="monotone" connectNulls={false} isAnimationActive animationDuration={1000}
                    activeDot={{ r: 4, fill: c.data, stroke: c.panel, strokeWidth: 2 }} />
                  {sel && <ReferenceArea x1={Math.min(sel.a, sel.b)} x2={Math.max(sel.a, sel.b)} fill={c.blue} fillOpacity={0.1} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 border-t border-line pt-2">
              <div className="lbl mb-1">{t('wx_strip')}</div>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${strip.length}, minmax(0, 1fr))` }}>
                {strip.map((d) => (
                  <div key={d.i} className="num rounded-md bg-sunk px-1 py-1 text-center text-[11px] leading-tight">
                    <div className="text-mute">{hhmm(d.time)}</div>
                    <div className="font-medium">{fmt(d.wind, 0)}<span className="text-mute"> м/с</span></div>
                    <div className={d.temp != null && d.temp < -10 ? 'text-blue' : 'text-mute'}>{d.temp == null ? '—' : `${d.temp > 0 ? '+' : ''}${d.temp.toFixed(0)}°`}</div>
                  </div>))}
              </div>
            </div>
          </div>
        )}
    </section>
  )
}

function State({ children, color }: { children: React.ReactNode; color: string }) {
  return <div className={`flex min-h-[360px] flex-col items-center justify-center text-[14px] ${color}`}>{children}</div>
}

interface TipProps { active?: boolean; payload?: { payload: Record<string, number | string | null> }[]; c: ReturnType<typeof usePalette>; t: ReturnType<typeof useT>['t'] }
function Tip({ active, payload, c, t }: TipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const row = (k: string, v: string, color: string) => <div className="flex justify-between gap-5"><span style={{ color }}>{k}</span><b className="num">{v}</b></div>
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px] shadow-lg">
      <div className="mb-1 text-mute">{ddmm(String(d.time))} {hhmm(String(d.time))}</div>
      {row(t('k_forecast'), `${fmt(d.fc as number, 2)} ${t('mw')}`, c.blue)}
      {d.fact != null && row(t('k_fact'), `${fmt(d.fact as number, 2)} ${t('mw')}`, c.data)}
      {d.wind != null && row(t('layer_wind'), fmt(d.wind as number, 1), c.mute)}
      {d.gust != null && row(t('layer_gust'), fmt(d.gust as number, 1), c.mute)}
      {d.temp != null && row(t('layer_temp'), fmt(d.temp as number, 1), c.mute)}
    </div>
  )
}
