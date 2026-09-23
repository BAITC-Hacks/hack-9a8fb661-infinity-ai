import type { ForecastRow, TurbineId, WindObject } from '../api/types'
import { fmt } from '../lib/calc'
import { useT } from '../lib/i18n'

interface Props {
  objects: WindObject[]
  byTurbine: Record<string, ForecastRow[]>
  horizon: number
  turbine: TurbineId
  onTurbine: (t: TurbineId) => void
}

/** Список турбин: Pном, прогноз и факт за горизонт; клик проваливается в турбину. */
export function StationList({ objects, byTurbine, horizon, turbine, onTurbine }: Props) {
  const { t } = useT()
  const rows = (objects.length ? objects : [{ object_id: 1, rated_power_mw: 2.5, turbine_model: '' }, { object_id: 2, rated_power_mw: 2.5, turbine_model: '' }]).map((o) => {
    const id: TurbineId = o.object_id === 1 ? 'T1' : 'T2'
    const rows = (byTurbine[id] ?? []).filter((r) => r.lead_hours <= horizon)
    const rated = o.rated_power_mw ?? 2.5
    const fact = rows.filter((r) => r.actual != null)
    return { id, rated, model: o.turbine_model ?? '', fc: rows.reduce((a, r) => a + r.p_hat, 0) * rated,
      fact: fact.length ? fact.reduce((a, r) => a + r.actual!, 0) * rated : null }
  })
  return (
    <aside className="panel !p-0">
      <div className="lbl px-3 pb-1 pt-3">{t('list')}</div>
      <table className="num w-full text-[13px]">
        <thead className="text-[10px] uppercase tracking-wider text-mute">
          <tr><th className="px-3 py-1.5 text-left font-medium">{t('list')}</th><th className="text-right font-medium">{t('l_rated')}</th><th className="text-right font-medium text-blue">{t('l_forecast')}</th><th className="px-3 text-right font-medium">{t('l_fact')}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onTurbine(r.id)} className={`cursor-pointer border-t border-line transition-colors hover:bg-sunk ${turbine === r.id ? 'bg-blue/10' : ''}`}>
              <td className="px-3 py-2"><div>{r.id === 'T1' ? t('t1') : t('t2')}</div><div className="mono text-mute">{r.model}</div></td>
              <td className="text-right text-mute">{fmt(r.rated, 1)}</td>
              <td className="text-right text-blue">{fmt(r.fc, 1)}</td>
              <td className="px-3 text-right">{fmt(r.fact, 1)}</td>
            </tr>
          ))}
          <tr onClick={() => onTurbine('STATION')} className={`cursor-pointer border-t border-line font-semibold hover:bg-sunk ${turbine === 'STATION' ? 'bg-blue/10' : ''}`}>
            <td className="px-3 py-2">{t('station')}</td>
            <td className="text-right text-mute">{fmt(rows.reduce((a, r) => a + r.rated, 0), 1)}</td>
            <td className="text-right text-blue">{fmt(rows.reduce((a, r) => a + r.fc, 0), 1)}</td>
            <td className="px-3 text-right">{rows.some((r) => r.fact != null) ? fmt(rows.reduce((a, r) => a + (r.fact ?? 0), 0), 1) : '—'}</td>
          </tr>
        </tbody>
      </table>
      <div className="mono px-3 py-2 text-mute">{t('mwh')}</div>
    </aside>
  )
}
