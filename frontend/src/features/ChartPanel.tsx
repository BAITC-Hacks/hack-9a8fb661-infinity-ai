import { Download, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ComposedChart, CartesianGrid, LabelList, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ForecastRow, TurbineId, WeatherPoint } from '../api/types'
import { devTone, fmt, TOL_PCT } from '../lib/calc'
import { ddmm, hhmm, ruDate } from '../lib/format'
import { useT } from '../lib/i18n'
import { usePalette } from '../lib/theme'
import type { View } from '../components/layout/FilterBar'

export interface PrevIssue { issue_date: string; rows: { target_time: string; p_hat: number }[] }
interface Props {
  rows: ForecastRow[]; weather: WeatherPoint[]; prevWeather: WeatherPoint[]; rated: number; turbine: TurbineId
  issueDate: string; horizon: number; view: View; loading: boolean; error: string | null; band: (lead: number) => number
  showFact: boolean; prev: PrevIssue[]
}

/** Заголовок 44px (крошки, допуск, пик, экспорт), чекбоксы слоёв, график с подписями и аннотациями, Δветра снизу | таблица. */
export function ChartPanel(p: Props) {
  const { t } = useT()
  const c = usePalette()
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null)
  const [cbWind, setWind] = useState(true)
  const [cbTemp, setTemp] = useState(true)
  const [cbPrev, setPrev] = useState(true)
  const cbBand = false

  const data = useMemo(() => {
    const w = new Map(p.weather.map((x) => [x.time, x]))
    const pw = new Map(p.prevWeather.map((x) => [x.time, x]))
    const prevMaps = p.prev.map((pi) => new Map(pi.rows.map((x) => [x.target_time, x.p_hat])))
    return p.rows.map((r, i) => {
      const wx = w.get(r.target_time), pwx = pw.get(r.target_time)
      const fcMw = r.p_hat * p.rated, factMw = !p.showFact || r.actual == null ? null : r.actual * p.rated
      const row: Record<string, number | string | null> = {
        i, time: r.target_time, fc: fcMw, fact: factMw,
        lo: r.p_lo == null ? null : r.p_lo * p.rated, hi: r.p_hi == null ? null : r.p_hi * p.rated,
        dev: factMw == null ? null : fcMw - factMw, devPct: factMw == null || r.actual == null ? null : (r.p_hat - r.actual) * 100,
        wind: wx?.wind_speed_100m ?? null, gust: wx?.wind_gusts_10m ?? null, temp: wx?.temperature_2m ?? null,
        dwind: wx?.wind_speed_100m != null && pwx?.wind_speed_100m != null ? wx.wind_speed_100m - pwx.wind_speed_100m : null,
        lblWind: cbWind && new Date(r.target_time).getUTCHours() % 3 === 1 && wx?.wind_speed_100m != null ? `${wx.wind_speed_100m.toFixed(1)}` : null,
        lblTemp: cbTemp && new Date(r.target_time).getUTCHours() % 3 === 1 && wx?.temperature_2m != null ? `${wx.temperature_2m > 0 ? '+' : ''}${wx.temperature_2m.toFixed(0)}°` : null,
      }
      prevMaps.forEach((m, k) => { const v = m.get(r.target_time); row[`prev${k}`] = v == null ? null : v * p.rated })
      return row
    })
  }, [p.rows, p.weather, p.prevWeather, p.prev, p.rated, p.band, p.showFact, cbWind, cbTemp])
  const shown = zoom ? data.slice(zoom[0], zoom[1] + 1) : data
  const fcs = data.map((d) => d.fc as number)
  const iPeak = fcs.length ? fcs.indexOf(Math.max(...fcs)) : -1
  const ticks = shown.filter((d) => new Date(String(d.time)).getUTCHours() % 6 === 1).map((d) => d.i as number)
  const crumbs = [t('root'), t('station'), p.turbine === 'STATION' ? null : p.turbine === 'T1' ? t('t1') : t('t2')].filter(Boolean) as string[]

  const exportCsv = () => {
    const head = `# ${t('station')} · ${p.turbine} · ${t('f_issue')} ${p.issueDate} · ${p.horizon}h\n`
    const cols = ['time_utc', 'forecast_mw', 'fact_mw', 'deviation_mw', 'deviation_pct', 'wind_100m_ms', 'gust_10m_ms', 'temp_c']
    const body = data.map((d) => [d.time, fmt(d.fc as number, 3), fmt(d.fact as number, 3), fmt(d.dev as number, 3), fmt(d.devPct as number, 1), fmt(d.wind as number, 1), fmt(d.gust as number, 1), fmt(d.temp as number, 1)].join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([head + cols.join(',') + '\n' + body], { type: 'text/csv;charset=utf-8' }))
    a.download = `forecast_${p.turbine}_${p.issueDate}_${p.horizon}h.csv`; a.click()
  }
  const Badge = ({ x, y, value, color }: { x?: number; y?: number; value?: string | number; color: string }) =>
    value == null || x == null || y == null ? null : (
      <g transform={`translate(${x},${y - 14})`}>
        <rect x={-16} y={-9} width={32} height={14} rx={3} fill={c.panel} stroke={color} strokeOpacity={0.6} />
        <text textAnchor="middle" y={2} fontSize={10} fill={color} fontFamily="ui-monospace, monospace">{value}</text>
      </g>)

  return (
    <section className="panel !p-0">
      <div className="flex h-[44px] items-center gap-3 border-b border-line bg-sunk px-3">
        <span className="text-[14px] font-semibold">{t('k_forecast')} · {crumbs[crumbs.length - 1]}</span>
        <span className="mono text-mute">{t('f_issue')} {ruDate(p.issueDate)} · +{p.horizon} {t('h_short')}</span>
        <span className="mono ml-auto hidden text-mute lg:inline">
          {t('tol', { tol: TOL_PCT })} · {iPeak >= 0 ? t('peak', { mw: fcs[iPeak].toFixed(2), t: hhmm(String(data[iPeak].time)) }) : '—'}
        </span>
        {p.loading && <Loader2 size={14} className="animate-spin text-mute" />}
        {zoom && <button onClick={() => setZoom(null)} className="rounded-md border border-line px-2 py-1 text-[11px] text-mute hover:text-text">{t('reset_zoom')}</button>}
        <button onClick={exportCsv} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-mute hover:border-blue hover:text-text"><Download size={12} />{t('download_csv')}</button>
      </div>

      {p.error ? <State color="text-bad">{t('err')}: {p.error}</State>
        : p.loading && !p.rows.length ? <State color="text-mute"><Loader2 className="mb-2 animate-spin" />{t('loading')}</State>
        : !p.rows.length ? <State color="text-mute">{t('nodata')}</State>
        : p.view === 'table' ? (
          <div className="scroll-thin max-h-[520px] overflow-auto">
            <table className="num w-full text-[13px]">
              <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-mute">
                <tr>{[t('th_time'), t('th_forecast'), t('th_fact'), t('th_dev'), t('th_devp'), t('th_wind'), t('th_temp')].map((h, i) =>
                  <th key={h} className={`border-b border-line px-3 py-2 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.map((d) => {
                  const tone = devTone(d.devPct as number | null)
                  return (
                    <tr key={String(d.i)} className={`border-b border-line/60 ${tone === 'warn' ? 'bg-warn/10' : tone === 'bad' ? 'bg-bad/10' : ''}`}>
                      <td className="px-3 py-1.5 text-left">{ddmm(String(d.time))} {hhmm(String(d.time))}</td>
                      <td className="px-3 text-right text-blue">{fmt(d.fc as number, 2)}</td>
                      <td className="px-3 text-right text-data">{fmt(d.fact as number, 2)}</td>
                      <td className="px-3 text-right">{d.dev == null ? '—' : `${(d.dev as number) > 0 ? '+' : ''}${(d.dev as number).toFixed(2)}`}</td>
                      <td className={`px-3 text-right ${tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : ''}`}>{d.devPct == null ? '—' : `${(d.devPct as number) > 0 ? '+' : ''}${(d.devPct as number).toFixed(1)}`}</td>
                      <td className="px-3 text-right text-mute">{fmt(d.wind as number, 1)}</td>
                      <td className="px-3 text-right text-mute">{fmt(d.temp as number, 1)}</td>
                    </tr>)
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-3">
            <div className="mb-2 flex flex-wrap items-center gap-4">
              <label className="chk"><input type="checkbox" checked={cbWind} onChange={(e) => setWind(e.target.checked)} />{t('cb_wind')}</label>
              <label className="chk"><input type="checkbox" checked={cbTemp} onChange={(e) => setTemp(e.target.checked)} />{t('cb_temp')}</label>
              <label className="chk"><input type="checkbox" checked={cbPrev} onChange={(e) => setPrev(e.target.checked)} />{t('cb_prev')}</label>
              <span className="ml-auto flex items-center gap-4 text-[12px] text-mute">
                {p.showFact && <span className="flex items-center gap-1.5"><i className="h-[2px] w-4" style={{ background: c.data }} />{t('k_fact')}</span>}
                <span className="flex items-center gap-1.5"><i className="h-0 w-4" style={{ borderTop: `2px dashed ${c.blue}` }} />{t('k_forecast')}</span>
                {cbPrev && p.prev.length > 0 && <span className="flex items-center gap-1.5"><i className="h-0 w-4" style={{ borderTop: `1px dotted ${c.mute}` }} />{t('pp_prev')} ×{p.prev.length}</span>}
              </span>
            </div>
            <div className="h-[400px] select-none">
              <ResponsiveContainer>
                <ComposedChart key={`${p.issueDate}${p.turbine}${p.horizon}`} data={shown} margin={{ top: 24, right: 12, left: -4, bottom: 0 }}
                  onMouseDown={(e) => e?.activeLabel != null && setSel({ a: Number(e.activeLabel), b: Number(e.activeLabel) })}
                  onMouseMove={(e) => sel && e?.activeLabel != null && setSel({ a: sel.a, b: Number(e.activeLabel) })}
                  onMouseUp={() => { if (sel && Math.abs(sel.b - sel.a) >= 2) setZoom([Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)]); setSel(null) }}>
                  <CartesianGrid stroke={c.line} strokeDasharray="3 5" />
                  <XAxis dataKey="i" type="number" domain={['dataMin', 'dataMax']} ticks={ticks} tickFormatter={(i) => (data[i] ? hhmm(String(data[i].time)) : '')}
                    tick={{ fill: c.mute, fontSize: 11, fontFamily: 'ui-monospace, monospace' }} tickLine={false} axisLine={{ stroke: c.line }} />
                  <YAxis domain={[0, p.rated]} tick={{ fill: c.mute, fontSize: 11, fontFamily: 'ui-monospace, monospace' }} tickLine={false} axisLine={false} width={44}
                    label={{ value: t('mw'), angle: -90, position: 'insideLeft', fill: c.mute, fontSize: 10 }} />
                  <Tooltip content={<Tip c={c} t={t} />} cursor={{ stroke: c.mute, strokeDasharray: '3 3' }} isAnimationActive={false} />
                  {cbBand && <Line dataKey="hi" stroke={c.blue} strokeOpacity={0.4} strokeWidth={1} strokeDasharray="2 3" dot={false} type="monotone" isAnimationActive={false} />}
                  {cbBand && <Line dataKey="lo" stroke={c.blue} strokeOpacity={0.4} strokeWidth={1} strokeDasharray="2 3" dot={false} type="monotone" isAnimationActive={false} />}
                  {cbPrev && p.prev.map((_, k) => <Line key={k} dataKey={`prev${k}`} stroke={c.curve} strokeOpacity={0.35 + 0.5 / (k + 1)} strokeWidth={1} strokeDasharray="2 4" dot={false} type="monotone" isAnimationActive={false} />)}
                  <Line dataKey="fc" stroke={c.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} type="monotone" isAnimationActive animationDuration={900}
                    activeDot={{ r: 4, fill: c.blue, stroke: c.panel, strokeWidth: 2 }}>
                    <LabelList dataKey="lblWind" content={(pr) => <Badge x={pr.x as number} y={pr.y as number} value={pr.value as string} color={c.blue} />} />
                    <LabelList dataKey="lblTemp" content={(pr) => <Badge x={pr.x as number} y={(pr.y as number) + 30} value={pr.value as string} color={c.warn} />} />
                  </Line>
                  <Line dataKey="fact" stroke={c.data} strokeWidth={2} dot={false} type="monotone" connectNulls={false} isAnimationActive animationDuration={1000}
                    activeDot={{ r: 4, fill: c.data, stroke: c.panel, strokeWidth: 2 }}>
                  </Line>
                  {sel && <ReferenceArea x1={Math.min(sel.a, sel.b)} x2={Math.max(sel.a, sel.b)} fill={c.blue} fillOpacity={0.1} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 border-t border-line pt-2">
              <div className="mb-1 flex items-center gap-4 text-[12px]">
                <span className="font-semibold">{t('wx_title')}</span>
                <span className="ml-auto flex items-center gap-1.5 text-mute"><i className="h-[2px] w-4" style={{ background: c.blue }} />{t('layer_wind')}</span>
                <span className="flex items-center gap-1.5 text-mute"><i className="h-[2px] w-4" style={{ background: c.warn }} />{t('layer_temp')}</span>
              </div>
              <div className="h-[130px]">
                <ResponsiveContainer>
                  <ComposedChart data={shown} margin={{ top: 6, right: 12, left: -4, bottom: 0 }}>
                    <CartesianGrid stroke={c.line} strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="i" type="number" domain={['dataMin', 'dataMax']} ticks={ticks} tickFormatter={(i) => (data[i] ? hhmm(String(data[i].time)) : '')} tick={{ fill: c.mute, fontSize: 10 }} tickLine={false} axisLine={{ stroke: c.line }} />
                    <YAxis yAxisId="w" tick={{ fill: c.mute, fontSize: 10 }} tickLine={false} axisLine={false} width={44} label={{ value: 'м/с', angle: -90, position: 'insideLeft', fill: c.mute, fontSize: 10 }} />
                    <YAxis yAxisId="t" orientation="right" tick={{ fill: c.warn, fontSize: 10 }} tickLine={false} axisLine={false} width={34} />
                    <Tooltip content={<Tip c={c} t={t} />} cursor={{ stroke: c.mute, strokeDasharray: '3 3' }} isAnimationActive={false} />
                    <Line yAxisId="w" dataKey="wind" stroke={c.blue} strokeWidth={2} dot={false} type="monotone" isAnimationActive animationDuration={800} />
                    <Line yAxisId="t" dataKey="temp" stroke={c.warn} strokeWidth={1.8} dot={false} type="monotone" isAnimationActive animationDuration={800} />
                  </ComposedChart>
                </ResponsiveContainer>
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
      {d.lo != null && row(t('range_short'), `${fmt(d.lo as number, 2)}–${fmt(d.hi as number, 2)} ${t('mw')}`, c.blue)}
      {d.fact != null && row(t('k_fact'), `${fmt(d.fact as number, 2)} ${t('mw')}`, c.data)}
      {d.prev0 != null && row(t('pp_prev'), `${fmt(d.prev0 as number, 2)} ${t('mw')}`, c.curve)}
      {d.wind != null && row(t('layer_wind'), fmt(d.wind as number, 1), c.mute)}
      {d.gust != null && row(t('layer_gust'), fmt(d.gust as number, 1), c.mute)}
      {d.temp != null && row(t('layer_temp'), fmt(d.temp as number, 1), c.mute)}
    </div>
  )
}
