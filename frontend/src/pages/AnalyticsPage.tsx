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
import { bucketLabel, useT } from '../lib/i18n'

function Section({ title, hint, children, className = '' }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`space-y-2 ${className}`}>
      <div className="flex items-baseline gap-2"><h2 className="text-[15px] font-semibold">{title}</h2>{hint && <span className="text-[12px] text-mute">{hint}</span>}</div>
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
  const cov = (metrics.data?.coverage ?? []).filter((c) => c.turbine === turbine)
  return (
    <main className="space-y-5 p-4">
      <div className="flex items-center gap-3">
        <div className="seg w-fit">{(['STATION', 'T1', 'T2'] as const).map((id) => <button key={id} className={turbine === id ? 'on' : ''} onClick={() => setTurbine(id)}>{name(id)}</button>)}</div>
        <span className="text-[12px] text-mute">{t('an_hint')}</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title={t('an_acc')} hint={t('an_acc_h')}>
          <div className="panel !p-0">
            <table className="num w-full text-[13px]">
              <thead className="text-[10px] uppercase tracking-wider text-mute">
                <tr>{[t('th_obj'), t('th_h'), t('th_mae'), t('th_rmse'), t('th_base'), t('th_skill')].map((h, i) => <th key={h} className={`border-b border-line px-3 py-2 font-medium ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {(metrics.data?.by_turbine_and_horizon ?? []).map((r) => (
                  <tr key={`${r.turbine}${r.bucket}`} className={`border-b border-line/60 ${r.turbine === turbine ? 'bg-blue/10' : ''}`}>
                    <td className="px-3 py-2">{name(r.turbine ?? '')}</td><td>{bucketLabel(r.bucket, t)}</td>
                    <td className="px-3 text-right">{r.mae.toFixed(3)}</td><td className="px-3 text-right">{r.rmse.toFixed(3)}</td>
                    <td className="px-3 text-right text-mute">{r.mae_base?.toFixed(3) ?? '—'}</td>
                    <td className="px-3 text-right font-semibold text-good">{pct(r.skill)}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title={t('p_daily')} hint={t('an_daily_h')}><DailyErrorPanel daily={metrics.data?.daily ?? []} turbine={turbine} error={metrics.error} bare /></Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Section title={t('ev_title')} hint={t('ev_h')}><EvidencePanel e={exps.data} /></Section>
        <Section title={t('cov_title')} hint={t('cov_h')}>
          <div className="grid grid-cols-2 gap-3">
            {cov.map((c, i) => (
              <div key={c.bucket} className="panel pop" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="text-[12px] text-mute">{bucketLabel(c.bucket, t)}</div>
                <div className={`num font-mono text-[28px] font-bold ${Math.abs(c.coverage - 0.8) <= 0.07 ? 'text-good' : 'text-warn'}`}>{Math.round(c.coverage * 100)}%</div>
                <div className="text-[11px] text-mute">{t('cov_width')} {(c.width * ratedOf(turbine)).toFixed(1)} {t('mw')}</div>
              </div>))}
          </div>
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title={t('p_curve')} hint={t('an_phys_h')}><PowerCurvePanel data={curve.data} error={curve.error} bare /></Section>
        <Section title={t('an_data')} hint={t('an_data_h')}><DataReconcile d={data.data} error={data.error} /></Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title={t('p_quality')} hint={t('an_data_h')}><QualityPanel q={quality.data} error={quality.error} bare /></Section>
        <Section title={t('p_feb')} hint={t('an_test_h')}><TestPeriodPanel points={timeline.data ?? []} rated={ratedOf(turbine)} error={timeline.error} bare /></Section>
      </div>
    </main>
  )
}
