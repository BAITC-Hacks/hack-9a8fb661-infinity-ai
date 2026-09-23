import { ShieldCheck } from 'lucide-react'
import type { Passport } from '../api/types'
import { useT } from '../lib/i18n'

/** «Паспорт» выпуска: что было доступно, какой прогон погоды, версия модели, контрольная сумма, диф с прошлым выпуском. */
export function PassportCard({ p, error }: { p: Passport | null; error: string | null }) {
  const { t } = useT()
  const Row = ({ k, v, tone }: { k: string; v: string; tone?: string }) => (
    <div className="flex justify-between gap-3 border-b border-line/60 py-1.5 text-[12px]"><span className="text-mute">{k}</span><span className={`num text-right ${tone ?? ''}`}>{v}</span></div>
  )
  return (
    <section className="panel rise self-start" style={{ animationDelay: '150ms' }}>
      <div className="mb-2 flex items-center justify-between"><h2 className="text-[16px] font-semibold">{t('passport')}</h2>
        {p?.weather.all_runs_before_issue && <span className="flex items-center gap-1 text-[11px] text-good"><ShieldCheck size={13} />{t('pp_ok')}</span>}</div>
      {error ? <p className="text-[13px] text-bad">{t('err')}: {error}</p> : !p ? <div className="shimmer h-40 rounded-lg" /> : (
        <>
          <Row k={t('pp_issue')} v={`${p.issue_time_utc} · ${p.issue_time_local} ${t('almaty')}`} />
          <Row k={t('pp_hist')} v={p.history_available_until} />
          <Row k={t('pp_weather')} v={p.weather.source} />
          {p.weather.runs.map((r) => <Row key={r.lead_day} k={`${t('pp_runs')} · ${r.hours}`} v={r.published_between} />)}
          <Row k={t('pp_checksum')} v={p.weather.checksum} />
          <Row k={t('pp_model')} v={p.model.version} />
          <Row k={t('pp_trained')} v={(p.model.trained_until ?? '—').slice(0, 16)} />
          {p.diff_vs_previous && (
            <div className="mt-3">
              <div className="lbl mb-1">{t('pp_diff')} · {p.diff_vs_previous.prev_issue}</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[[t('pp_dp'), `${(p.diff_vs_previous.mean_abs_dp * 100).toFixed(1)}%`, p.diff_vs_previous.mean_abs_dp > 0.1],
                  [t('pp_dwind'), `${p.diff_vs_previous.mean_abs_dwind.toFixed(1)} м/с`, p.diff_vs_previous.mean_abs_dwind > 1.5],
                  [t('pp_overlap'), String(p.diff_vs_previous.overlap_hours), false]].map(([k, v, warn]) => (
                  <div key={String(k)} className="rounded-lg border border-line bg-sunk px-2 py-1.5">
                    <div className="text-[10px] text-mute">{k}</div><div className={`num font-mono text-[15px] font-semibold ${warn ? 'text-warn' : ''}`}>{v}</div>
                  </div>))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
