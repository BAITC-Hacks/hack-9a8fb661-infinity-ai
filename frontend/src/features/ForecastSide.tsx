import { CheckCircle2, CloudSun, ShieldCheck, XCircle } from 'lucide-react'
import type { ForecastRow, WeatherPoint } from '../api/types'
import { ruDate } from '../lib/format'
import { useT } from '../lib/i18n'

/** Карточки «Погодный выпуск» и «Последний расчёт» (по второму макету), на реальных данных. */
export function WeatherRelease({ weather, issueDate }: { weather: WeatherPoint[]; issueDate: string }) {
  const { t } = useT()
  const n = weather.filter((w) => w.wind_speed_100m != null).length
  const Row = ({ k, v, tone }: { k: string; v: string; tone?: string }) => <div className="flex justify-between gap-3 border-b border-line/60 py-1.5 text-[13px]"><span className="text-mute">{k}</span><span className={`num text-right ${tone ?? ''}`}>{v}</span></div>
  return (
    <section className="panel rise">
      <div className="mb-2 flex items-center gap-2"><CloudSun size={16} className="text-blue" /><h2 className="text-[15px] font-semibold">{t('wr_title')}</h2></div>
      <Row k={t('wr_model')} v={t('wr_model_v')} />
      <Row k={t('wr_issue')} v={`${ruDate(issueDate)}, 05:00`} />
      <Row k={t('wr_avail')} v={t('wr_avail_v')} />
      <Row k={t('wr_cov')} v={t('wr_cov_v', { n, m: weather.length || 48 })} tone={n === weather.length && n > 0 ? 'text-good font-semibold' : 'text-warn'} />
    </section>
  )
}

export function LastCalc({ rows, prevRows, rated }: { rows: ForecastRow[]; prevRows: { target_time: string; p_hat: number }[]; rated: number }) {
  const { t } = useT()
  const full = rows.length >= 24
  const inRange = rows.every((r) => r.p_hat >= 0 && r.p_hat <= 1)
  const energy = rows.reduce((a, r) => a + r.p_hat, 0) * rated
  const pm = new Map(prevRows.map((r) => [r.target_time, r.p_hat]))
  const common = rows.filter((r) => pm.has(r.target_time))
  const eCur = common.reduce((a, r) => a + r.p_hat, 0), ePrev = common.reduce((a, r) => a + (pm.get(r.target_time) ?? 0), 0)
  const diff = ePrev > 0 ? (eCur / ePrev - 1) * 100 : null
  const ok = full && inRange && Number.isFinite(energy)
  const Check = ({ on, label }: { on: boolean; label: string }) => <div className="flex items-center gap-2 py-1 text-[13px]">{on ? <CheckCircle2 size={16} className="text-good" /> : <XCircle size={16} className="text-bad" />}{label}</div>
  return (
    <section className="panel rise" style={{ animationDelay: '80ms' }}>
      <h2 className="mb-2 text-[15px] font-semibold">{t('lc_title')}</h2>
      <div className={`mb-1 flex items-center gap-2 text-[14px] font-medium ${ok ? 'text-good' : 'text-warn'}`}><ShieldCheck size={16} />{t('lc_ok')}</div>
      <Check on={full} label={t('lc_h')} /><Check on={inRange} label={t('lc_range')} /><Check on={Number.isFinite(energy)} label={t('lc_energy')} />
      {diff != null && <div className="mt-2 flex justify-between border-t border-line pt-2 text-[13px]"><span className="text-mute">{t('lc_diff')}</span>
        <span className={`num font-semibold ${diff >= 0 ? 'text-good' : 'text-warn'}`}>{diff >= 0 ? '+' : ''}{diff.toFixed(1)}%</span></div>}
    </section>
  )
}

export function HourlyTable({ rows, weather, rated, showFact }: { rows: ForecastRow[]; weather: WeatherPoint[]; rated: number; showFact: boolean }) {
  const { t } = useT()
  const wm = new Map(weather.map((w) => [w.time, w]))
  const hh = (iso: string) => { const d = new Date(new Date(iso).getTime() + 5 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:00` }
  return (
    <section className="panel rise !p-0">
      <div className="flex h-[44px] items-center border-b border-line bg-sunk px-3"><h2 className="text-[15px] font-semibold">{t('hr_title')}</h2></div>
      <div className="scroll-thin max-h-[360px] overflow-y-auto">
        <table className="num w-full text-[13px]">
          <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-mute"><tr>
            {[t('th_time'), t('th_wind'), t('th_temp'), t('th_forecast'), t('hr_band'), t('hr_energy'), ...(showFact ? [t('th_fact')] : [])].map((h, i) =>
              <th key={h} className={`border-b border-line px-3 py-2 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const w = wm.get(r.target_time)
              return (
                <tr key={r.target_time} className="border-b border-line/50 hover:bg-sunk">
                  <td className="px-3 py-1.5">{hh(r.target_time)}</td>
                  <td className="px-3 text-right">{w?.wind_speed_100m?.toFixed(1) ?? '—'}</td>
                  <td className="px-3 text-right text-mute">{w?.temperature_2m?.toFixed(1) ?? '—'}</td>
                  <td className="px-3 text-right font-semibold text-blue">{(r.p_hat * rated).toFixed(2)}</td>
                  <td className="px-3 text-right text-mute">{r.p_lo != null && r.p_hi != null ? `${(r.p_lo * rated).toFixed(2)}–${(r.p_hi * rated).toFixed(2)}` : '—'}</td>
                  <td className="px-3 text-right">{(r.p_hat * rated).toFixed(2)}</td>
                  {showFact && <td className="px-3 text-right text-data">{r.actual != null ? (r.actual * rated).toFixed(2) : '—'}</td>}
                </tr>)
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Одна строка статуса: покрытие погоды, проверки, изменение энергии к прошлому выпуску. */
export function StatusLine({ weather, rows, prevRows }: { weather: WeatherPoint[]; rows: ForecastRow[]; prevRows: { target_time: string; p_hat: number }[] }) {
  const n = weather.filter((w) => w.wind_speed_100m != null).length
  const ok = rows.length >= 24 && rows.every((r) => r.p_hat >= 0 && r.p_hat <= 1)
  const pm = new Map(prevRows.map((r) => [r.target_time, r.p_hat]))
  const common = rows.filter((r) => pm.has(r.target_time))
  const ePrev = common.reduce((a, r) => a + (pm.get(r.target_time) ?? 0), 0)
  const diff = ePrev > 0 ? (common.reduce((a, r) => a + r.p_hat, 0) / ePrev - 1) * 100 : null
  return (
    <div className="panel flex flex-wrap items-center gap-x-4 gap-y-1 !py-2.5 text-[12px]">
      <span className={`flex items-center gap-1.5 ${ok ? 'text-good' : 'text-warn'}`}><ShieldCheck size={14} />{ok ? 'проверки пройдены' : 'есть замечания'}</span>
      <span className="flex items-center gap-1.5 text-mute"><CloudSun size={14} />погода {n}/{weather.length || 48} ч</span>
      {diff != null && <span className="text-mute">к прошлому выпуску <b className={`num ${diff >= 0 ? 'text-good' : 'text-warn'}`}>{diff >= 0 ? '+' : ''}{diff.toFixed(0)}%</b></span>}
    </div>
  )
}
