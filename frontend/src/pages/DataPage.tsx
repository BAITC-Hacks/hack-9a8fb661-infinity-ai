import { AlertTriangle, CheckCircle2, CircleSlash, Database, Wind } from 'lucide-react'
import { api } from '../api/client'
import { DataReconcile } from '../features/DataReconcile'
import { QualityPanel } from '../features/QualityPanel'
import { useAsync } from '../hooks/useAsync'
import type { Ctx } from '../lib/ctx'
import { useT } from '../lib/i18n'

interface Sources { storage: string; items: { name: string; source: string; status: 'ok' | 'missing'; detail: string }[] }
interface Anoms { summary: { turbine: string; kind: string; title: string; episodes: number; hours: number }[]; examples: { turbine: string; kind: string; start: string; hours: number }[]; rules: string }
const get = <T,>(u: string) => fetch(u, { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json() as Promise<T> })

/** Данные и источники: паспорт турбин, датасеты, архив погоды, таблицы ClickHouse, аномалии в истории. */
export function DataPage({ ctx }: { ctx: Ctx }) {
  const { t } = useT()
  const src = useAsync(() => get<Sources>('/api/sources'), [])
  const an = useAsync(() => get<Anoms>('/api/anomalies'), [])
  const data = useAsync(api.data, [])
  const quality = useAsync(api.quality, [])
  const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between gap-3 border-b border-line/60 py-1.5 text-[13px]"><span className="text-mute">{k}</span><span className="num text-right">{v}</span></div>
  return (
    <main className="space-y-4 p-4">
      <h1 className="text-[22px] font-semibold">{t('ds_title')}</h1>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel">
          <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Wind size={16} className="text-blue" />{t('ds_turbines')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {ctx.objs.map((o) => (
              <div key={o.object_id}>
                <div className="mb-1 text-[13px] font-semibold">{o.name}</div>
                <Row k={t('ts_rated')} v={`${o.rated_power_mw} ${t('mw')}`} />
                <Row k={t('ts_hub')} v={`${o.tower_height_m} м`} />
                <Row k={t('ts_rotor')} v={`${o.rotor_diameter_m} м`} />
                <Row k={t('ds_maker')} v={t('ds_maker_v')} />
              </div>))}
          </div>
        </section>

        <section className="panel">
          <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Database size={16} className="text-blue" />{t('ds_sources')}
            </h2>
          {src.error ? <p className="text-[13px] text-bad">{src.error}</p> : !src.data ? <div className="shimmer h-40 rounded-lg" /> : (
            <ul className="space-y-2">
              {src.data.items.map((i) => (
                <li key={i.name} className="flex items-start gap-2.5 border-b border-line/60 pb-2">
                  {i.status === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" /> : <CircleSlash size={16} className="mt-0.5 shrink-0 text-warn" />}
                  <div className="min-w-0 flex-1 text-[13px] font-medium">{i.name} <span className="font-normal text-mute">· {i.source}</span></div>
                  <div className={`num max-w-[45%] text-right text-[12px] ${i.status === 'ok' ? '' : 'text-warn'}`}>{i.detail}</div>
                </li>))}
            </ul>)}
        </section>
      </div>

      <section className="panel">
        <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><AlertTriangle size={16} className="text-warn" />{t('ds_anom')}</h2>
        {an.error ? <p className="text-[13px] text-bad">{an.error}</p> : !an.data ? <div className="shimmer h-32 rounded-lg" /> : (
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <table className="num w-full text-[13px]">
              <thead className="text-[10px] uppercase tracking-wider text-mute"><tr>
                <th className="border-b border-line py-2 text-left font-medium">{t('ds_check')}</th>
                {ctx.objs.map((o) => <th key={o.object_id} className="border-b border-line px-3 py-2 text-right font-medium">{o.object_id === 1 ? t('t1') : t('t2')}</th>)}</tr></thead>
              <tbody>
                {[...new Map(an.data.summary.map((r) => [r.kind, r.title])).entries()].map(([kind, title]) => (
                  <tr key={kind} className="border-b border-line/60">
                    <td className="py-2 pr-3">{title}</td>
                    {['T1', 'T2'].map((tb) => { const r = an.data!.summary.find((x) => x.kind === kind && x.turbine === tb)
                      return <td key={tb} className={`px-3 text-right ${r && r.episodes ? 'text-warn' : 'text-good'}`}>{r && r.episodes ? `${r.episodes} · ${r.hours} ${t('h_short')}` : '✓ 0'}</td> })}
                  </tr>))}
              </tbody>
            </table>
            <div>
              <div className="lbl mb-1">{t('ds_examples')}</div>
              <ul className="space-y-1 text-[12px]">
                {an.data.examples.map((e, i) => <li key={i} className="flex justify-between border-b border-line/50 py-1"><span>{e.turbine === 'T1' ? t('t1') : t('t2')} · {e.start}</span><span className="text-warn">{e.hours} {t('h_short')}</span></li>)}
                {!an.data.examples.length && <li className="text-mute">—</li>}
              </ul>
            </div>
          </div>)}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="space-y-2"><h2 className="text-[15px] font-semibold">{t('ds_tables')}</h2><DataReconcile d={data.data} error={data.error} /></section>
        <section className="space-y-2"><h2 className="text-[15px] font-semibold">{t('p_quality')}</h2><QualityPanel q={quality.data} error={quality.error} bare /></section>
      </div>
    </main>
  )
}
