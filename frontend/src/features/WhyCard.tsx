import { Compass, Snowflake, Thermometer, Wind } from 'lucide-react'
import type { AgentLogEntry, ForecastRow, Run, WeatherPoint } from '../api/types'
import { fmt } from '../lib/calc'
import { ddmm, hhmm } from '../lib/format'
import { useT } from '../lib/i18n'

/** «Почему такой прогноз»: разбор в контрольной точке (пик), вывод агента, его решения. */
export function WhyCard({ rows, weather, run, log }: { rows: ForecastRow[]; weather: WeatherPoint[]; run: Run | null; log: AgentLogEntry[] }) {
  const { t } = useT()
  if (!rows.length) return null
  const p = rows.map((r) => r.p_hat)
  const peak = rows[p.indexOf(Math.max(...p))]
  const wx = weather.find((w) => w.time === peak.target_time)
  const reasons = log.filter((e) => e.reason).map((e) => e.reason as string)
  const summary = (run?.summary ?? '').replace(/\[mock\]\s*/g, '')
  const low = run?.status === 'low_confidence'
  return (
    <section className="panel rise self-start">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-semibold">{t('why')}</h2>
        <span className="mono num text-mute">{t('why_point')} · {ddmm(peak.target_time)} {hhmm(peak.target_time)}</span>
      </div>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Fact icon={<Wind size={14} />} k={t('why_wind')} v={`${fmt(wx?.wind_speed_100m, 1)} м/с`} />
          <Fact icon={<Wind size={14} />} k={t('why_gust')} v={`${fmt(wx?.wind_gusts_10m, 1)} м/с`} />
          <Fact icon={(wx?.temperature_2m ?? 0) < -10 ? <Snowflake size={14} /> : <Thermometer size={14} />} k={t('why_temp')} v={`${fmt(wx?.temperature_2m, 1)} °C`} />
          <Fact icon={<Compass size={14} />} k={t('why_dir')} v={wx?.wind_direction_100m == null ? '—' : `${Math.round(wx.wind_direction_100m)}°`} />
        </div>
        <div className="space-y-2 text-[14px] leading-relaxed">
          {summary && <p>{summary}</p>}
          <div className="text-[13px]">
            <span className="lbl">{t('why_decisions')}</span>
            <ul className="mt-1 space-y-1">
              {reasons.length ? reasons.map((r, i) => <li key={i} className="flex gap-2 text-warn"><span>→</span><span>{r}</span></li>)
                : <li className="text-mute">{t('why_none')}</li>}
            </ul>
          </div>
          {run && <span className={`mono ${low ? 'text-warn' : 'text-good'}`}>● {low ? t('why_status_low') : t('why_status_ok')} · Open-Meteo previous runs</span>}
        </div>
      </div>
    </section>
  )
}

function Fact({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return (
    <div className="rounded-lg border border-line bg-sunk px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-mute">{icon}{k}</div>
      <div className="num mt-0.5 font-mono text-[18px] font-semibold">{v}</div>
    </div>
  )
}
