import { api } from '../api/client'
import { DailyErrorPanel } from '../features/DailyErrorPanel'
import { DataReconcile } from '../features/DataReconcile'
import { EvidencePanel } from '../features/EvidencePanel'
import { PowerCurvePanel } from '../features/PowerCurvePanel'
import { QualityPanel } from '../features/QualityPanel'
import { TestPeriodPanel } from '../features/TestPeriodPanel'
import { useAsync } from '../hooks/useAsync'
import type { Ctx } from '../lib/ctx'
import { pct } from '../lib/format'
import { useT } from '../lib/i18n'

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="border-l-2 border-blue pl-3"><h2 className="text-[16px] font-semibold">{title}</h2><p className="max-w-3xl text-[13px] text-mute">{desc}</p></div>
      {children}
    </section>
  )
}

export function AnalyticsPage({ ctx }: { ctx: Ctx }) {
  const { t } = useT()
  const { turbine, setTurbine, ratedOf, tick } = ctx
  const metrics = useAsync(api.metrics, [tick])
  const quality = useAsync(api.quality, [])
  const data = useAsync(api.data, [])
  const exps = useAsync(api.experiments, [])
  const timeline = useAsync(() => api.timeline(turbine), [turbine, tick])
  const curve = useAsync(() => api.powerCurve(turbine), [turbine])
  const name = (id: string) => (id === 'STATION' ? t('station') : id === 'T1' ? t('t1') : t('t2'))
  return (
    <main className="space-y-8 p-4">
      <div className="flex flex-col gap-1"><span className="lbl">{t('f_object')}</span>
        <div className="seg w-fit">{(['STATION', 'T1', 'T2'] as const).map((id) => <button key={id} className={turbine === id ? 'on' : ''} onClick={() => setTurbine(id)}>{name(id)}</button>)}</div></div>

      <Section title={t('an_acc')} desc={t('an_acc_d')}>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="panel !p-0">
            <table className="num w-full text-[13px]">
              <thead className="text-[10px] uppercase tracking-wider text-mute">
                <tr>{[t('th_obj'), t('th_h'), t('th_mae'), t('th_rmse'), t('th_base'), t('th_skill')].map((h, i) => <th key={h} className={`border-b border-line px-3 py-2 font-medium ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {(metrics.data?.by_turbine_and_horizon ?? []).map((r) => (
                  <tr key={`${r.turbine}${r.bucket}`} className={`border-b border-line/60 ${r.turbine === turbine ? 'bg-blue/10' : ''}`}>
                    <td className="px-3 py-2">{name(r.turbine ?? '')}</td><td>{r.bucket}</td>
                    <td className="px-3 text-right">{r.mae.toFixed(3)}</td><td className="px-3 text-right">{r.rmse.toFixed(3)}</td>
                    <td className="px-3 text-right text-mute">{r.mae_base?.toFixed(3) ?? '—'}</td>
                    <td className="px-3 text-right font-semibold text-good">{pct(r.skill)}</td>
                  </tr>))}
              </tbody>
            </table>
            {metrics.data?.note && <p className="px-3 py-2 text-[11px] text-mute">{metrics.data.note}</p>}
          </div>
          <DailyErrorPanel daily={metrics.data?.daily ?? []} turbine={turbine} error={metrics.error} />
        </div>
      </Section>

      <Section title={t('ev_title')} desc={t('ev_desc')}><EvidencePanel e={exps.data} /></Section>

      <Section title={t('cov_title')} desc={t('cov_desc')}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(metrics.data?.coverage ?? []).filter((c) => c.turbine === turbine).map((c, i) => (
            <div key={c.bucket} className="panel pop" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="text-[13px] text-mute">{c.bucket} · {t('cov_hit')}</div>
              <div className={`num font-mono text-[26px] font-bold ${Math.abs(c.coverage - 0.8) <= 0.07 ? 'text-good' : 'text-warn'}`}>{Math.round(c.coverage * 100)}%</div>
              <div className="text-[11px] text-mute">{t('cov_width')} {(c.width * ratedOf(turbine)).toFixed(2)} {t('mw')} · n={c.n}</div>
            </div>))}
        </div>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title={t('an_phys')} desc={t('an_phys_d')}><PowerCurvePanel data={curve.data} error={curve.error} /></Section>
        <Section title={t('an_data')} desc={t('an_data_d')}>
          <DataReconcile d={data.data} error={data.error} />
          <QualityPanel q={quality.data} error={quality.error} />
        </Section>
      </div>
      <Section title={t('an_test')} desc={t('an_test_d')}><TestPeriodPanel points={timeline.data ?? []} rated={ratedOf(turbine)} error={timeline.error} /></Section>
    </main>
  )
}
