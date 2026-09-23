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
type Layer = 'wind' | 'gust' | 'temp'

/** Панель над графиком 44px (крошки, допуск, пик, экспорт) + график с зумом и слоями погоды | таблица. */
export function ChartPanel(p: Props) {
  const { t } = useT()
  const c = usePalette()
  const [layers, setLayers] = useState<Layer[]>(['wind'])
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
  const ticks = shown.filter((d) => new Date(d.time).getUTCHours() % 6 === 1).map((d) => d.i)  // 6:00/12:00/… по Алматы (UTC+5)
  const crumbs = [t('root'), t('station'), p.turbine === 'STATION' ? null : p.turbine === 'T1' ? t('t1') : t('t2')].filter(Boolean) as string[]
  const toggle = (l: Layer) => setLayers((xs) => (xs.includes(l) ? xs.filter((x) => x !== l) : [...xs, l]))

  const exportCsv = () => {
    const head = `# ${t('station')} · ${p.turbine} · ${t('f_issue')} ${p.issueDate} · ${p.horizon}h · Open-Meteo previous runs\n`
    const cols = ['time_utc', 'forecast_mw', 'fact_mw', 'deviation_mw', 'deviation_pct', 'wind_100m_ms', 'gust_10m_ms', 'temp_c']
    const body = data.map((d) => [d.time, fmt(d.fc, 3), fmt(d.fact, 3), fmt(d.dev, 3), fmt(d.devPct, 1), fmt(d.wind, 1), fmt(d.gust, 1), fmt(d.temp, 1)].join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([head + cols.join(',') + '\n' + body], { type: 'text/csv;charset=utf-8' }))
    a.download = `forecast_${p.turbine}_${p.issueDate}_${p.horizon}h.csv`; a.click()
  }

  return (
    <section className="panel !p-0">
      <div className="flex h-[44px] items-center gap-3 border-b border-line bg-sunk px-3">
        <span className="mono truncate">
          {crumbs.map((x, i) => <span key={x}>{i > 0 && <span className="text-mute"> / </span>}<span className={i === crumbs.length - 1 ? 'text-blue' : 'text-mute'}>{x}</span></span>)}
        </span>
        <span className="mono ml-auto hidden text-mute lg:inline">
          {t('tol', { tol: TOL_PCT })} · {iPeak >= 0 ? t('peak', { mw: data[iPeak].fc.toFixed(2), t: hhmm(data[iPeak].time) }) : '—'}
        </span>
        {p.loading && <Loader2 size={14} className="animate-spin text-mute" />}
        {zoom && <button onClick={() => setZoom(null)} className="rounded-md border border-line px-2 py-1 text-[11px] text-mute hover:text-text">{t('reset_zoom')}</button>}
        <button onClick={exportCsv} title={t('export')} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-mute hover:border-blue hover:text-text"><Download size={12} />{t('export')}</button>
      </div>

      {p.error ? <State color="text-bad">{t('err')}: {p.error}</State>
        : p.loading && !p.rows.length ? <State color="text-mute"><Loader2 className="mb-2 animate-spin" />{t('loading')}</State>
        : !p.rows.length ? <State color="text-mute">{t('nodata')}</State>
        : p.view === 'table' ? (
          <div className="scroll-thin max-h-[420px] overflow-auto">
            <table className="num w-full text-[13px]">
              <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-mute">
                <tr>{[t('th_time'), t('th_forecast'), t('th_fact'), t('th_dev'), t('th_devp'), t('th_wind'), t('th_temp')].map((h, i) =>
                  <th key={h} className={`border-b border-line px-3 py-2 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.map((d) => {
                  const tone = devTone(d.devPct)
                  const bg = tone === 'warn' ? 'bg-warn/10' : tone === 'bad' ? 'bg-bad/10' : ''
                  return (
                    <tr key={d.i} className={`border-b border-line/60 ${bg}`}>
                      <td className="px-3 py-1.5 text-left">{ddmm(d.time)} {hhmm(d.time)}</td>
                      <td className="px-3 text-right text-blue">{fmt(d.fc, 2)}</td>
                      <td className="px-3 text-right">{fmt(d.fact, 2)}</td>
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
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="lbl">Open-Meteo</span>
              {([['wind', t('layer_wind'), c.mute], ['gust', t('layer_gust'), c.curve], ['temp', t('layer_temp'), c.warn]] as [Layer, string, string][]).map(([l, label, col]) => (
                <button key={l} onClick={() => toggle(l)} className={`flex items-center gap-1.5 rounded-[20px] border px-2.5 py-0.5 transition-colors ${layers.includes(l) ? 'border-blue text-text' : 'border-line text-mute hover:text-text'}`}>
                  <i className="h-0 w-3" style={{ borderTop: `2px dashed ${col}` }} />{label}
                </button>))}
              <span className="ml-auto flex items-center gap-3 text-mute">
                <span className="flex items-center gap-1.5"><i className="h-0 w-4" style={{ borderTop: `2px solid ${c.text}` }} />{t('k_fact')}</span>
                <span className="flex items-center gap-1.5"><i className="h-0 w-4" style={{ borderTop: `2px dashed ${c.blue}` }} />{t('k_forecast')}</span>
                <span className="num">{t('f_issue')} {ruDate(p.issueDate)} · {p.horizon} h</span>
              </span>
            </div>
            <div className="h-[360px] select-none">
              <ResponsiveContainer>
                <ComposedChart key={`${p.issueDate}${p.turbine}${p.horizon}`} data={shown} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
                  onMouseDown={(e) => e?.activeLabel != null && setSel({ a: Number(e.activeLabel), b: Number(e.activeLabel) })}
                  onMouseMove={(e) => sel && e?.activeLabel != null && setSel({ a: sel.a, b: Number(e.activeLabel) })}
                  onMouseUp={() => { if (sel && Math.abs(sel.b - sel.a) >= 2) setZoom([Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)]); setSel(null) }}>
                  <CartesianGrid stroke={c.line} strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="i" type="number" domain={['dataMin', 'dataMax']} ticks={ticks} tickFormatter={(i) => (data[i] ? hhmm(data[i].time) : '')}
                    tick={{ fill: c.mute, fontSize: 12 }} tickLine={false} axisLine={{ stroke: c.line }} />
                  <YAxis yAxisId="p" domain={[0, p.rated]} tick={{ fill: c.mute, fontSize: 12 }} tickLine={false} axisLine={false} width={40} unit="" />
                  {(layers.includes('wind') || layers.includes('gust')) && <YAxis yAxisId="w" orientation="right" tick={{ fill: c.mute, fontSize: 11 }} tickLine={false} axisLine={false} width={34} />}
                  {layers.includes('temp') && <YAxis yAxisId="t" orientation="right" tick={{ fill: c.warn, fontSize: 11 }} tickLine={false} axisLine={false} width={34} />}
                  <Tooltip content={<Tip c={c} t={t} />} cursor={{ stroke: c.line }} isAnimationActive={false} />
                  <Area yAxisId="p" dataKey="band" stroke="none" fill={c.blue} fillOpacity={0.15} isAnimationActive animationDuration={800} />
                  {layers.includes('wind') && <Line yAxisId="w" dataKey="wind" stroke={c.mute} strokeDasharray="3 3" strokeWidth={1.2} dot={false} isAnimationActive animationDuration={800} />}
                  {layers.includes('gust') && <Line yAxisId="w" dataKey="gust" stroke={c.curve} strokeDasharray="3 3" strokeWidth={1.2} dot={false} isAnimationActive animationDuration={800} />}
                  {layers.includes('temp') && <Line yAxisId="t" dataKey="temp" stroke={c.warn} strokeDasharray="3 3" strokeWidth={1.2} dot={false} isAnimationActive animationDuration={800} />}
                  <Line yAxisId="p" dataKey="fact" stroke={c.text} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive animationDuration={900} />
                  <Line yAxisId="p" dataKey="fc" stroke={c.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive animationDuration={900} />
                  {sel && <ReferenceArea yAxisId="p" x1={Math.min(sel.a, sel.b)} x2={Math.max(sel.a, sel.b)} fill={c.blue} fillOpacity={0.1} />}
                </ComposedChart>
              </ResponsiveContainer>
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
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-[12px]">
      <div className="mb-1 text-mute">{ddmm(String(d.time))} {hhmm(String(d.time))}</div>
      {row(t('k_forecast'), `${fmt(d.fc as number, 2)} ${t('mw')}`, c.blue)}
      {d.fact != null && row(t('k_fact'), `${fmt(d.fact as number, 2)} ${t('mw')}`, c.text)}
      {d.wind != null && row(t('layer_wind'), `${fmt(d.wind as number, 1)} м/с`, c.mute)}
      {d.temp != null && row(t('layer_temp'), `${fmt(d.temp as number, 1)} °C`, c.warn)}
    </div>
  )
}
