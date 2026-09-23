import { Compass, Mountain, Wind, X, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api } from '../api/client'
import type { TurbineId } from '../api/types'
import { MiniTurbine } from '../features/MiniTurbine'
import { SiteMap } from '../features/SiteMap'
import { useAsync } from '../hooks/useAsync'
import { kpis } from '../lib/calc'
import type { Ctx } from '../lib/ctx'
import { hhmm, pct, ruDate } from '../lib/format'
import { useT } from '../lib/i18n'

export function MapPage({ ctx }: { ctx: Ctx }) {
  const { t } = useT()
  const { issueDate, objs, ratedOf, tick } = ctx
  const [sel, setSel] = useState<number | null>(null)
  const station = useAsync(() => api.forecast(issueDate, 'STATION'), [issueDate, tick])
  const weather = useAsync(() => api.weather(issueDate), [issueDate])
  const selId: TurbineId | null = sel == null ? null : sel === 1 ? 'T1' : 'T2'
  const one = useAsync(() => (selId ? api.forecast(issueDate, selId) : Promise.resolve(null)), [issueDate, selId, tick])
  const rated = ratedOf('STATION')
  const k = kpis(station.data?.rows ?? [], rated)
  const wx = (weather.data ?? []).find((w) => w.time === k.peakTime) ?? null
  const list = objs
  const obj = list.find((o) => o.object_id === sel) ?? null
  const live = useMemo(() => {
    const rows = one.data?.rows ?? []
    if (!rows.length || !obj) return null
    const r0 = rows[0], p = rows.map((r) => r.p_hat), iMax = p.indexOf(Math.max(...p))
    const w0 = (weather.data ?? []).find((w) => w.time === r0.target_time)
    const facts = rows.filter((r) => r.actual != null)
    const rt = obj.rated_power_mw ?? 2.5
    return { now: r0, nowMw: r0.p_hat * rt, w0, peakMw: p[iMax] * rt, peakT: rows[iMax].target_time, e48: p.reduce((a, b) => a + b, 0) * rt,
      lastFact: facts.length ? facts[facts.length - 1] : null, status: one.data?.run.status, factMw: facts.length ? facts[facts.length - 1].actual! * rt : null }
  }, [one.data, obj, weather.data])
  const Row = ({ k, v, tone }: { k: string; v: string; tone?: string }) => <div className="flex justify-between gap-3 border-b border-line/60 py-1.5 text-[13px]"><span className="text-mute">{k}</span><span className={`num text-right ${tone ?? ''}`}>{v}</span></div>

  return (
    <main className="p-4">
      <div className={`grid gap-4 ${obj ? 'xl:grid-cols-[1fr_380px]' : ''}`}>
        <div className="space-y-4">
          <SiteMap objects={objs} wind={wx?.wind_speed_100m ?? null} direction={wx?.wind_direction_100m ?? null} power={k.peakMw == null ? null : k.peakMw / rated}
            selected={sel} onSelect={(id) => setSel((s) => (s === id ? null : id))} />
          <section className="panel rise">
            <div className="mb-2 flex items-center gap-2"><Mountain size={16} className="text-blue" /><h2 className="text-[16px] font-semibold">{t('site')}</h2>
              <span className="mono ml-auto text-mute">{list.map((o) => `T${o.object_id}`).join(' · ')} — {t('map_hint')}</span></div>
            <p className="text-[13px] leading-relaxed text-mute">{t('site_desc')}</p>
            <div className="mt-2 flex flex-wrap items-center gap-5 text-[12px] text-mute">
              <span className="flex items-center gap-1"><Zap size={12} className="text-blue" />{rated} {t('mw')}</span>
              <span className="flex items-center gap-1"><Compass size={12} className="text-blue" />{wx?.wind_direction_100m == null ? '—' : `${Math.round(wx.wind_direction_100m)}°`} · {wx?.wind_speed_100m == null ? '—' : `${wx.wind_speed_100m.toFixed(1)} м/с`}</span>
              <span>{t('elev')}: ≈ 555 м</span><span>{t('ts_operator')}: Samruk-Green Energy</span><span>{t('ts_year')}: 20.07.2020</span><span>{t('ts_annual')}: ≈ 16 млн кВт·ч</span>
            </div>
          </section>
        </div>

        {obj && (
          <aside className="panel pop self-start !p-0">
            <div className="flex h-[44px] items-center gap-2 border-b border-line bg-sunk px-3">
              <Wind size={16} className="text-blue" /><span className="text-[14px] font-semibold">{obj.name}</span>
              <button onClick={() => setSel(null)} className="ml-auto text-mute hover:text-text" aria-label="close"><X size={16} /></button>
            </div>
            <div className="p-3">
              <MiniTurbine hub={obj.tower_height_m ?? 80} rotor={obj.rotor_diameter_m ?? 109} wind={live?.w0?.wind_speed_100m ?? wx?.wind_speed_100m ?? 0} direction={live?.w0?.wind_direction_100m ?? wx?.wind_direction_100m ?? 0} />
              {live && (
                <div className="mt-3">
                  <div className="lbl mb-1">{t('f_issue')} {ruDate(issueDate)} · {t('live')}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Tile k={`${t('k_forecast')} ${hhmm(live.now.target_time)}`} v={`${live.nowMw.toFixed(2)} ${t('mw')}`} sub={pct(live.now.p_hat)} tone="text-blue" />
                    <Tile k={t('k_fact')} v={live.factMw == null ? '—' : `${live.factMw.toFixed(2)} ${t('mw')}`} sub={live.lastFact ? hhmm(live.lastFact.target_time) : t('c_nofact')} tone="text-data" />
                    <Tile k={t('layer_wind')} v={live.w0?.wind_speed_100m == null ? '—' : `${live.w0.wind_speed_100m.toFixed(1)}`} sub={live.w0?.wind_direction_100m == null ? '' : `${Math.round(live.w0.wind_direction_100m)}°`} />
                    <Tile k={t('layer_temp')} v={live.w0?.temperature_2m == null ? '—' : `${live.w0.temperature_2m.toFixed(1)}`} sub={live.w0?.wind_gusts_10m == null ? '' : `${t('layer_gust')} ${live.w0.wind_gusts_10m.toFixed(0)}`} />
                  </div>
                  <Row k={t('k_peak')} v={`${live.peakMw.toFixed(2)} ${t('mw')} · ${hhmm(live.peakT)}`} />
                  <Row k={t('k_energy')} v={`${live.e48.toFixed(1)} ${t('mwh')}`} />
                  <Row k="status" v={live.status === 'ok' ? t('why_status_ok') : t('why_status_low')} tone={live.status === 'ok' ? 'text-good' : 'text-warn'} />
                </div>)}
              <div className="mt-3">
                <div className="lbl mb-1">{obj.turbine_model}</div>
                <Row k={t('ts_rated')} v={`${obj.rated_power_mw ?? 2.5} ${t('mw')}`} />
                <Row k={t('ts_hub')} v={`${obj.tower_height_m ?? 80} м`} />
                <Row k={t('ts_rotor')} v={`${obj.rotor_diameter_m ?? 109} м · ${(Math.PI * ((obj.rotor_diameter_m ?? 109) / 2) ** 2 / 1000).toFixed(1)} тыс. м²`} />
                <Row k={t('ts_wind')} v="3 / 10,3 / 25 м/с" />
                <Row k={t('ts_class')} v="IEC IIA/IIIA" />
                <Row k={t('ts_coord')} v={`${obj.latitude.toFixed(5)}, ${obj.longitude.toFixed(5)}`} />
              </div>
            </div>
          </aside>)}
      </div>
    </main>
  )
}

function Tile({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-sunk px-3 py-2">
      <div className="text-[11px] text-mute">{k}</div>
      <div className={`num font-mono text-[18px] font-semibold ${tone ?? ''}`}>{v}</div>
      {sub && <div className="text-[11px] text-mute">{sub}</div>}
    </div>
  )
}
