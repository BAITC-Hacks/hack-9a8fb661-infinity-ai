import { Compass, Mountain, Wind, Zap } from 'lucide-react'
import { api } from '../api/client'
import { FALLBACK, SiteMap } from '../features/SiteMap'
import { useAsync } from '../hooks/useAsync'
import { kpis } from '../lib/calc'
import type { Ctx } from '../lib/ctx'
import { useT } from '../lib/i18n'

export function MapPage({ ctx }: { ctx: Ctx }) {
  const { t } = useT()
  const { issueDate, objs, ratedOf, tick } = ctx
  const forecast = useAsync(() => api.forecast(issueDate, 'STATION'), [issueDate, tick])
  const weather = useAsync(() => api.weather(issueDate), [issueDate])
  const rated = ratedOf('STATION')
  const k = kpis(forecast.data?.rows ?? [], rated)
  const wx = (weather.data ?? []).find((w) => w.time === k.peakTime) ?? null
  const list = objs.length ? objs : FALLBACK
  const dist = list.length >= 2 ? Math.round(Math.hypot((list[0].latitude - list[1].latitude) * 111000, (list[0].longitude - list[1].longitude) * 111000 * Math.cos((list[0].latitude * Math.PI) / 180))) : null
  const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between gap-3 border-b border-line/60 py-1.5 text-[13px]"><span className="text-mute">{k}</span><span className="num text-right">{v}</span></div>
  return (
    <main className="space-y-4 p-4">
      <SiteMap objects={objs} wind={wx?.wind_speed_100m ?? null} direction={wx?.wind_direction_100m ?? null} power={k.peakMw == null ? null : k.peakMw / rated} />
      <div className="grid gap-4 md:grid-cols-3">
        {list.map((o, i) => (
          <section key={o.object_id} className="panel rise" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="mb-2 flex items-center gap-2"><Wind size={16} className="text-blue" /><h2 className="text-[16px] font-semibold">{o.name}</h2><span className="mono ml-auto text-mute">{o.turbine_model}</span></div>
            <Row k={t('ts_rated')} v={`${o.rated_power_mw ?? 2.5} ${t('mw')}`} />
            <Row k={t('ts_hub')} v={`${o.tower_height_m ?? 80} м`} />
            <Row k={t('ts_rotor')} v={`${o.rotor_diameter_m ?? 109} м · ${(Math.PI * ((o.rotor_diameter_m ?? 109) / 2) ** 2 / 1000).toFixed(1)} тыс. м²`} />
            <Row k={t('ts_wind')} v="3 / 10,3 / 25 м/с" />
            <Row k={t('ts_class')} v="IEC IIA/IIIA" />
            <Row k={t('ts_coord')} v={`${o.latitude.toFixed(5)}, ${o.longitude.toFixed(5)}`} />
          </section>))}
        <section className="panel rise" style={{ animationDelay: '160ms' }}>
          <div className="mb-2 flex items-center gap-2"><Mountain size={16} className="text-blue" /><h2 className="text-[16px] font-semibold">{t('site')}</h2></div>
          <p className="mb-2 text-[13px] leading-relaxed text-mute">{t('site_desc')}</p>
          <Row k={t('dist')} v={dist == null ? '—' : `${dist} м`} />
          <Row k={t('elev')} v="≈ 555 м" />
          <Row k={t('ts_operator')} v="Samruk-Green Energy" />
          <Row k={t('ts_year')} v="20.07.2020" />
          <Row k={t('ts_annual')} v="≈ 16 млн кВт·ч/год" />
          <div className="mt-2 flex items-center gap-4 text-[12px] text-mute">
            <span className="flex items-center gap-1"><Zap size={12} className="text-blue" />{rated} {t('mw')}</span>
            <span className="flex items-center gap-1"><Compass size={12} className="text-blue" />{wx?.wind_direction_100m == null ? '—' : `${Math.round(wx.wind_direction_100m)}°`} · {wx?.wind_speed_100m == null ? '—' : `${wx.wind_speed_100m.toFixed(1)} м/с`}</span>
          </div>
        </section>
      </div>
    </main>
  )
}
