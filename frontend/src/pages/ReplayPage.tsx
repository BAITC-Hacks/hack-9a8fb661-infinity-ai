import { AlertTriangle, CheckCircle2, CloudDownload, Download, FileCheck2, Pause, Play, RefreshCw, Settings2, SkipForward, TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { TurbineId } from '../api/types'
import { useAsync } from '../hooks/useAsync'
import type { Ctx } from '../lib/ctx'
import { ddmm, hhmm, ruDate } from '../lib/format'
import { useT } from '../lib/i18n'
import { usePalette } from '../lib/theme'
import { completedForecast } from '../lib/calc'

const START = '2026-01-31', END = '2026-02-27'
const shift = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const days = (() => { const out: string[] = []; for (let d = START; d <= END; d = shift(d, 1)) out.push(d); return out })()

/** Историческое воспроизведение февраля: шаг за шагом, как если бы прогноз делался в прошлом. */
export function ReplayPage({ ctx }: { ctx: Ctx }) {
  const { t, lang } = useT()
  const c = usePalette()
  const { ratedOf, tick } = ctx
  const [idx, setIdx] = useState(days.indexOf(ctx.issueDate) >= 0 ? days.indexOf(ctx.issueDate) : 0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [turbine, setTurbine] = useState<TurbineId>('STATION')
  const issue = days[idx], prevIssue = idx > 0 ? days[idx - 1] : shift(issue, -1)

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setIdx((i) => { if (i >= days.length - 1) { setPlaying(false); return i } return i + 1 }), 1800 / speed)
    return () => clearInterval(id)
  }, [playing, speed])
  useEffect(() => { ctx.setIssueDate(issue) }, [issue]) // eslint-disable-line react-hooks/exhaustive-deps

  const cur = useAsync(() => api.forecast(issue, turbine), [issue, turbine, tick])
  const prev = useAsync(() => api.forecast(prevIssue, turbine).catch(() => null), [prevIssue, turbine, tick])
  const log = useAsync(() => api.log(issue), [issue, tick])
  const runs = useAsync(api.issues, [tick])
  const rated = ratedOf(turbine)
  const completed = !cur.loading && !cur.error && completedForecast(cur.data, issue)
  const lowConfidence = completed && cur.data?.run.status === 'low_confidence'

  const data = useMemo(() => {
    const pm = new Map((prev.data?.rows ?? []).map((r) => [r.target_time, r.p_hat]))
    return (cur.data?.rows ?? []).map((r, i) => ({ i, time: r.target_time, cur: r.p_hat * rated, prev: pm.has(r.target_time) ? pm.get(r.target_time)! * rated : null }))
  }, [cur.data, prev.data, rated])
  const overlap = data.filter((d) => d.prev != null)
  const dE = overlap.reduce((a, d) => a + d.cur - (d.prev ?? 0), 0)
  const prevEnd = overlap.length ? overlap[overlap.length - 1].i : null
  const ticks = data.filter((d) => new Date(d.time).getUTCHours() % 6 === 1).map((d) => d.i)

  const tools = new Set((log.loading || log.error ? [] : log.data ?? [])
    .filter((e) => e.issue_date === issue).map((e) => e.tool))
  const steps = [[t('rp_s1'), tools.has('fetch_forecast')], [t('rp_s2'), tools.has('prepare_features')], [t('rp_s3'), tools.has('predict')], [t('rp_s4'), tools.has('report')]] as const
  const decisions = [...(log.data ?? [])].reverse().slice(0, 6).map((e) => {
    const r = (e.result ?? {}) as Record<string, number | string | boolean>
    const m: Record<string, [React.ReactNode, string, string]> = {
      fetch_forecast: [<CloudDownload size={16} />, t('dc_weather'), t('dc_weather_s', { w: Number(r.mean_wind_100m ?? 0).toFixed(1) })],
      prepare_features: [<FileCheck2 size={16} />, t('dc_check'), Number(r.max_fact_gap_h ?? 0) > 0 ? t('dc_gap', { h: String(r.max_fact_gap_h) }) : t('dc_nogap')],
      train_model: [<Settings2 size={16} />, t('dc_train'), t('dc_train_s')],
      predict: [<CheckCircle2 size={16} />, t('dc_pred'), t('dc_pred_s')],
      analyze: [<CheckCircle2 size={16} />, t('dc_an'), t('dc_an_s', { m: Math.round(Number(r.mean_p ?? 0) * 100) })],
      replan: [<RefreshCw size={16} />, t('dc_replan'), e.reason ?? ''],
      report: [<FileCheck2 size={16} />, t('dc_rep'), ''],
      evaluate: [<CheckCircle2 size={16} />, t('dc_eval'), ''],
    }
    const [icon, title, sub] = m[e.tool] ?? [<AlertTriangle size={16} />, e.tool, e.reason ?? '']
    return { id: e.id, ts: e.ts.slice(11, 16), icon, title, sub: e.reason && e.tool !== 'replan' ? e.reason : sub, warn: !!e.reason }
  })
  const runMap = new Map((runs.data ?? []).map((r) => [r.issue_date, r]))
  const tableRows = days.slice(Math.max(0, idx - 4), idx + 1).reverse()

  return (
    <main className="space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[24px] font-semibold">{t('rp_title')}</h1><p className="text-[14px] text-mute">{t('rp_sub', { h: 48 })}</p></div>
        <a href={api.exportCsvUrl} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] hover:border-blue"><Download size={15} />{t('rp_export')}</a>
      </div>

      <section className="panel space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="lbl">{t('rp_moment')}</div>
            <div key={issue} className="pop text-[26px] font-semibold">{new Date(`${issue}T00:00:00Z`).toLocaleDateString(lang === 'kk' ? 'kk-KZ' : 'ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</div>
            <div className="mono text-mute">05:00 · UTC+5 (00:00 UTC)</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setPlaying((p) => !p)} className="flex items-center gap-2 rounded-lg bg-blue px-4 py-2.5 font-semibold text-ink">{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? t('rp_pause') : t('rp_play')}</button>
            <button onClick={() => setIdx((i) => Math.min(days.length - 1, i + 1))} className="flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 hover:border-blue"><SkipForward size={16} />{t('rp_next')}</button>
            <div className="ml-2 flex flex-col gap-1"><span className="lbl">{t('rp_speed')}</span>
              <div className="seg">{[1, 2, 4].map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}</div></div>
          </div>
        </div>

        <div className="relative px-1 pt-2">
          <div className="absolute left-1 right-1 top-[15px] h-[3px] rounded bg-line" />
          <div className="absolute left-1 top-[15px] h-[3px] rounded bg-blue transition-all duration-500" style={{ width: `calc(${(idx / (days.length - 1)) * 100}% - 4px)` }} />
          <div className="relative flex justify-between">
            {days.map((d, i) => (
              <button key={d} onClick={() => setIdx(i)} title={ruDate(d)} className="group flex flex-col items-center">
                <span className={`z-10 rounded-full transition-all ${i === idx ? 'size-4 bg-blue ring-4 ring-blue/25' : i < idx ? 'size-2.5 bg-blue' : 'size-2.5 bg-line group-hover:bg-mute'}`} />
                {(i === 0 || i === days.length - 1 || i === idx || i % 7 === 1) && <span className={`mono mt-1.5 ${i === idx ? 'font-semibold text-text' : 'text-mute'}`}>{ruDate(d)}</span>}
              </button>))}
          </div>
          <div className="mt-1 text-center text-[11px] text-blue">{t('rp_window', { a: ruDate(shift(issue, 0)), b: ruDate(shift(issue, 2)) })}</div>
        </div>

        <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-warn">{t('rp_note')}</div>

        <div className="flex flex-wrap items-center gap-2">
          {steps.map(([label, ok], i) => (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <span className={`h-[2px] w-10 ${ok ? 'bg-good' : 'bg-line'}`} />}
              <span key={`${issue}${i}`} className="pop flex items-center gap-2 text-[13px]" style={{ animationDelay: `${i * 150}ms` }}>
                {completed && ok ? <CheckCircle2 size={20} className="text-good" /> : <span className="size-5 rounded-full border-2 border-line" />}{label}</span>
            </div>))}
          <span className={`ml-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] ${completed && !lowConfidence ? 'bg-good/10 text-good' : 'bg-warn/10 text-warn'}`}>
            {completed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {t(cur.loading ? 'loading' : cur.error ? 'err' : lowConfidence ? 'rp_low' : completed ? 'rp_done' : 'rp_incomplete')}
          </span>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <section className="panel">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[16px] font-semibold">{t('rp_update')}</h2>
            <div className="seg">{(['STATION', 'T1', 'T2'] as TurbineId[]).map((id) => <button key={id} className={turbine === id ? 'on' : ''} onClick={() => setTurbine(id)}>{id === 'STATION' ? t('station') : id === 'T1' ? t('t1') : t('t2')}</button>)}</div>
            <div className="flex items-center gap-4 text-[12px] text-mute">
              <span className="flex items-center gap-1.5"><i className="h-[2px] w-5" style={{ background: c.blue }} />{t('rp_cur', { d: ruDate(issue) })}</span>
              <span className="flex items-center gap-1.5"><i className="h-0 w-5" style={{ borderTop: `2px dashed ${c.mute}` }} />{t('rp_prev', { d: ruDate(prevIssue) })}</span>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer>
              <ComposedChart key={`${issue}${turbine}`} data={data} margin={{ top: 16, right: 12, left: -6, bottom: 0 }}>
                <CartesianGrid stroke={c.line} strokeDasharray="3 5" />
                <XAxis dataKey="i" type="number" domain={['dataMin', 'dataMax']} ticks={ticks} tickFormatter={(i) => (data[i] ? `${ddmm(data[i].time)} ${hhmm(data[i].time)}` : '')} tick={{ fill: c.mute, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.line }} />
                <YAxis domain={[0, rated]} tick={{ fill: c.mute, fontSize: 11 }} tickLine={false} axisLine={false} width={40} label={{ value: t('mw'), angle: -90, position: 'insideLeft', fill: c.mute, fontSize: 10 }} />
                <Tooltip isAnimationActive={false} contentStyle={{ background: c.panel, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12, color: c.text }}
                  labelFormatter={(i) => (data[Number(i)] ? `${ddmm(data[Number(i)].time)} ${hhmm(data[Number(i)].time)}` : '')} formatter={(v) => `${Number(v).toFixed(2)} ${t('mw')}`} />
                {prevEnd != null && <ReferenceLine x={prevEnd} stroke={c.mute} strokeDasharray="3 3" label={{ value: t('rp_prev_end'), position: 'insideTopLeft', fill: c.mute, fontSize: 10 }} />}
                <Line dataKey="prev" name={t('rp_prev', { d: ruDate(prevIssue) })} stroke={c.mute} strokeWidth={1.8} strokeDasharray="5 4" dot={false} type="monotone" connectNulls={false} isAnimationActive animationDuration={700} />
                <Line dataKey="cur" name={t('rp_cur', { d: ruDate(issue) })} stroke={c.blue} strokeWidth={2.5} dot={false} type="monotone" isAnimationActive animationDuration={900} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {overlap.length > 0 && <span key={issue} className={`pop flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium ${dE >= 0 ? 'bg-good/10 text-good' : 'bg-warn/10 text-warn'}`}>
              {dE >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}{t('rp_overlap', { n: overlap.length, v: `${dE >= 0 ? '+' : ''}${dE.toFixed(1)}` })}</span>}
            {issue > '2026-01-31' && <span className="ml-auto text-[12px] text-mute">ⓘ {t('rp_nofact')}</span>}
          </div>
        </section>

        <section className="panel !p-0">
          <div className="flex h-[44px] items-center gap-2 border-b border-line bg-sunk px-3"><span className="text-[14px] font-semibold">{t('rp_decisions')}</span>
            <span className="ml-auto flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-mute"><Settings2 size={12} />{t('rp_auto')}</span></div>
          <ol className="relative space-y-3 p-4 before:absolute before:bottom-6 before:left-[74px] before:top-6 before:w-px before:bg-line">
            {decisions.map((d, i) => (
              <li key={d.id} className="pop grid grid-cols-[40px_12px_24px_1fr] items-start gap-2" style={{ animationDelay: `${i * 90}ms` }}>
                <span className="mono pt-0.5 text-mute">{d.ts}</span>
                <span className={`relative z-10 mt-1.5 size-2.5 rounded-full ${d.warn ? 'bg-warn' : 'bg-good'}`} />
                <span className={d.warn ? 'text-warn' : 'text-blue'}>{d.icon}</span>
                <span><span className="block text-[13px] font-semibold">{d.title}</span>{d.sub && <span className="block text-[12px] text-mute">{d.sub}</span>}</span>
              </li>))}
          </ol>
        </section>
      </div>

      <section className="panel !p-0">
        <div className="flex h-[44px] items-center gap-3 border-b border-line bg-sunk px-3">
          <span className="text-[14px] font-semibold">{t('rp_progress')}</span>
          <span className="mono ml-auto text-mute">{t('rp_of', { i: idx + 1, n: days.length })} · {idx < days.length - 1 ? t('rp_next_run', { d: `${ruDate(days[idx + 1])}, 05:00` }) : '—'}</span>
        </div>
        <table className="num w-full text-[13px]">
          <thead className="text-[10px] uppercase tracking-wider text-mute"><tr>
            {[t('rp_th_run'), t('rp_th_weather'), t('rp_th_h'), t('rp_th_t'), t('rp_th_status')].map((h) => <th key={h} className="border-b border-line px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {tableRows.map((d) => {
              const r = runMap.get(d)
              return (
                <tr key={d} className={`pop border-b border-line/60 ${d === issue ? 'bg-blue/10' : ''}`}>
                  <td className="px-3 py-2">{ruDate(d)}.2026, 05:00</td>
                  <td className="px-3">{ruDate(shift(d, -1))} (+1…24 {t('h_short')}) · {ruDate(shift(d, -2))} (+25…48 {t('h_short')})</td>
                  <td className="px-3">48 {t('h_short')}</td><td className="px-3">2 / 2</td>
                  <td className="px-3">{r ? <span className={`flex items-center gap-1.5 ${r.status === 'ok' ? 'text-good' : 'text-warn'}`}><CheckCircle2 size={14} />{r.status === 'ok' ? t('rp_ready') : t('rp_low')}</span> : '—'}</td>
                </tr>)
            })}
          </tbody>
        </table>
      </section>
    </main>
  )
}
