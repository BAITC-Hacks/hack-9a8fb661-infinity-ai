import { useCountUp } from '../hooks/useCountUp'
import { devTone, type Kpis, type Tone, TOL_PCT } from '../lib/calc'
import { hhmm } from '../lib/format'
import { useT } from '../lib/i18n'

const TONE: Record<Tone, string> = { neutral: 'text-text', good: 'text-good', warn: 'text-warn', bad: 'text-bad' }

/** Полоса из пяти ключевых чисел; цвет числа = цвет линии на графике. */
export function KpiStrip({ k, showFact }: { k: Kpis; showFact: boolean }) {
  const { t } = useT()
  const dev = showFact ? devTone(k.devPct) : 'neutral'
  const hid = t('hidden_then')
  return (
    <div className="grid grid-cols-2 divide-line border-b border-line bg-sunk md:grid-cols-5 md:divide-x">
      <Cell label={t('k_forecast')} value={k.forecastMwh} digits={1} unit={t('mwh')} color="text-blue" formula={t('f_forecast')} />
      <Cell label={t('k_fact')} value={showFact ? k.factMwh : null} digits={1} unit={t('mwh')} color="text-data" formula={t('f_fact')} caption={!showFact ? hid : ''} />
      <Cell label={t('k_dev')} value={showFact ? k.devMwh : null} digits={1} unit={t('mwh')} color={TONE[dev]} sign formula={t('f_dev', { tol: TOL_PCT })}
        caption={showFact && k.devPct != null ? `${k.devPct > 0 ? '+' : ''}${k.devPct.toFixed(1)}%` : ''} />
      <Cell label={t('k_peak')} value={k.peakMw} digits={2} unit={t('mw')} color="text-blue" formula={t('f_peak')} caption={k.peakTime ? t('c_peak', { t: hhmm(k.peakTime) }) : ''} big />
      <Cell label={t('k_acc')} value={showFact ? k.accuracy : null} digits={1} unit="%" color={!showFact || k.accuracy == null ? 'text-text' : k.accuracy >= 85 ? 'text-good' : k.accuracy >= 70 ? 'text-warn' : 'text-bad'} formula={t('f_acc')} caption={!showFact ? hid : ''} />
    </div>
  )
}

function Cell({ label, value, digits, unit, color, caption = '', sign, formula, big }: { label: string; value: number | null; digits: number; unit: string; color: string; caption?: string; sign?: boolean; formula: string; big?: boolean }) {
  const v = useCountUp(value)
  return (
    <div className="group relative flex h-[84px] flex-col justify-between px-4 py-2.5" title={formula}>
      <span className="flex items-center gap-1 text-[13px] text-mute">{label}<span className="cursor-help text-[11px] opacity-50 group-hover:opacity-100">ⓘ</span></span>
      <span className="flex items-baseline gap-1.5">
        <span className={`num font-mono text-[26px] font-bold leading-none ${color}`}>{v == null ? '—' : `${sign && v > 0 ? '+' : ''}${v.toFixed(digits)}`}</span>
        <span className="text-[11px] text-mute">{unit}</span>
      </span>
      <span className={`truncate ${big ? 'text-[13px] font-semibold text-blue' : 'text-[11px] text-mute'}`}>{caption}</span>
    </div>
  )
}
