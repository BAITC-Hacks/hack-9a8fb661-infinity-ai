import { ShieldCheck } from 'lucide-react'
import type { Passport } from '../api/types'
import { useT } from '../lib/i18n'

const fmtLocal = (s: string) => s.replace('T', ' ').replace('Z', '')

/** Как получен прогноз — обычными предложениями. */
export function PassportCard({ p, error }: { p: Passport | null; error: string | null }) {
  const { t } = useT()
  if (error) return <p className="text-[13px] text-bad">{t('err')}: {error}</p>
  if (!p) return <div className="shimmer h-24 rounded-lg" />
  const r1 = p.weather.runs.find((r) => r.lead_day === 1), r2 = p.weather.runs.find((r) => r.lead_day === 2)
  const d = p.diff_vs_previous
  return (
    <div className="space-y-2 rounded-lg border border-line bg-sunk p-3 text-[13px] leading-relaxed">
      <p>{t('pp_l1', { local: p.issue_time_local, utc: fmtLocal(p.issue_time_utc) })}</p>
      <p>{t('pp_l2', { hist: fmtLocal(p.history_available_until) })}</p>
      <p>{t('pp_l3', { h1: r1?.hours ?? '+1…+24', h2: r2?.hours ?? '+25…+48' })}</p>
      <p>{t('pp_l4', { trained: (p.model.trained_until ?? '—').slice(0, 10), sum: p.weather.checksum })}</p>
      {d && <p>{t('pp_l5', { prev: d.prev_issue, dw: d.mean_abs_dwind.toFixed(1), dp: (d.mean_abs_dp * 100).toFixed(1), n: d.overlap_hours })}</p>}
      {p.weather.all_runs_before_issue && <p className="flex items-center gap-1 text-good"><ShieldCheck size={13} />{t('pp_ok')}</p>}
    </div>
  )
}
