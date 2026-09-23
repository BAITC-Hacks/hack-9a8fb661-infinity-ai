import { api } from '../api/client'
import { DailyErrorPanel } from '../features/DailyErrorPanel'
import { PowerCurvePanel } from '../features/PowerCurvePanel'
import { QualityPanel } from '../features/QualityPanel'
import { TestPeriodPanel } from '../features/TestPeriodPanel'
import { useAsync } from '../hooks/useAsync'
import type { Ctx } from '../lib/ctx'
import { useT } from '../lib/i18n'

export function AnalyticsPage({ ctx }: { ctx: Ctx }) {
  const { t } = useT()
  const { turbine, setTurbine, ratedOf, tick } = ctx
  const metrics = useAsync(api.metrics, [tick])
  const quality = useAsync(api.quality, [])
  const timeline = useAsync(() => api.timeline(turbine), [turbine, tick])
  const curve = useAsync(() => api.powerCurve(turbine), [turbine])
  return (
    <main className="space-y-4 p-4">
      <div className="flex items-end gap-4">
        <div className="flex flex-col gap-1"><span className="lbl">{t('f_object')}</span>
          <div className="seg">{(['STATION', 'T1', 'T2'] as const).map((id) => <button key={id} className={turbine === id ? 'on' : ''} onClick={() => setTurbine(id)}>{id === 'STATION' ? t('station') : id === 'T1' ? t('t1') : t('t2')}</button>)}</div></div>
      </div>
      <div className="grid gap-4 min-[1000px]:grid-cols-2">
        <PowerCurvePanel data={curve.data} error={curve.error} />
        <DailyErrorPanel daily={metrics.data?.daily ?? []} turbine={turbine} error={metrics.error} />
        <QualityPanel q={quality.data} error={quality.error} />
        <TestPeriodPanel points={timeline.data ?? []} rated={ratedOf(turbine)} error={timeline.error} />
      </div>
    </main>
  )
}
