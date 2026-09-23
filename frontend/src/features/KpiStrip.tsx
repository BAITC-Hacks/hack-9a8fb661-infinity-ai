import { useCountUp } from '../hooks/useCountUp'
import { devTone, type Kpis, type Tone, TOL_PCT } from '../lib/calc'
import { hhmm } from '../lib/format'
import { useT } from '../lib/i18n'

const TONE: Record<Tone, string> = { neutral: 'text-text', good: 'text-good', warn: 'text-warn', bad: 'text-bad' }

/** Полоса из пяти ключевых чисел; цвет числа = цвет линии на графике. */
export function KpiStrip({ k }: { k: Kpis }) {
  const { t } = useT()
  const dev = devTone(k.devPct)
  return (
    <div className="grid grid-cols-2 divide-line border-b border-line bg-sunk md:grid-cols-5 md:divide-x">
      <Cell label={t('k_forecast')} value={k.forecastMwh} digits={1} unit={t('mwh')} color="text-blue" caption={t('c_forecast')} />
      <Cell label={t('k_fact')} value={k.factMwh} digits={1} unit={t('mwh')} color="text-text" caption={k.nFact ? t('c_fact') : t('c_nofact')} />
      <Cell label={t('k_dev')} value={k.devMwh} digits={1} unit={t('mwh')} color={TONE[dev]} sign
        caption={k.devPct != null ? `${k.devPct > 0 ? '+' : ''}${k.devPct.toFixed(1)}% · ${t('c_dev', { tol: TOL_PCT })}` : t('c_dev', { tol: TOL_PCT })} />
      <Cell label={t('k_peak')} value={k.peakMw} digits={2} unit={t('mw')} color="text-blue" caption={k.peakTime ? t('c_peak', { t: hhmm(k.peakTime) }) : '—'} />
      <Cell label={t('k_acc')} value={k.accuracy} digits={1} unit="%" color={k.accuracy == null ? 'text-text' : k.accuracy >= 85 ? 'text-good' : k.accuracy >= 70 ? 'text-warn' : 'text-bad'} caption={t('c_acc')} />
    </div>
  )
}

function Cell({ label, value, digits, unit, color, caption, sign }: { label: string; value: number | null; digits: number; unit: string; color: string; caption: string; sign?: boolean }) {
  const v = useCountUp(value)
  return (
    <div className="flex h-[84px] flex-col justify-between px-4 py-2.5">
      <span className="text-[13px] text-mute">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className={`num font-mono text-[26px] font-bold leading-none ${color}`}>{v == null ? '—' : `${sign && v > 0 ? '+' : ''}${v.toFixed(digits)}`}</span>
        <span className="text-[11px] text-mute">{unit}</span>
      </span>
      <span className="truncate text-[11px] text-mute">{caption}</span>
    </div>
  )
}
