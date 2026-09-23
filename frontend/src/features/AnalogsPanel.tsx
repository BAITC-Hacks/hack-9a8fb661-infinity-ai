import { History } from 'lucide-react'
import type { Analogs } from '../api/types'
import { ruDate } from '../lib/format'
import { useT } from '../lib/i18n'

/** Память агента: похожие прошлые дни и их факт. */
export function AnalogsPanel({ a, loading }: { a: Analogs | null; loading: boolean }) {
  const { t } = useT()
  return (
    <section className="panel rise !p-0">
      <div className="flex h-[40px] items-center gap-2 border-b border-line bg-sunk px-3">
        <History size={14} className="text-curve" /><span className="text-[13px] font-semibold">{t('mem_title')}</span>
        {a?.k != null && <span className="mono ml-auto text-mute">{a.k} / {a.candidates}</span>}
      </div>
      <div className="p-3">
        {loading && !a ? <div className="shimmer h-32 rounded-lg" /> : a?.error ? <p className="text-[12px] text-mute">{a.error}</p> : a && (
          <>
            <div className="mb-2 rounded-md bg-sunk px-3 py-2 text-[12px]">
              <span className="text-mute">{t('mem_alt')}: </span>
              <b className="num font-mono">{a.energy_mwh.mean} {t('mwh')}</b>
              <span className="num text-mute"> · Q10–Q90 {a.energy_mwh.q10}–{a.energy_mwh.q90}</span>
            </div>
            <ul className="space-y-1">
              {a.days.slice(0, 6).map((d, i) => (
                <li key={d.issue_date} className="pop grid grid-cols-[52px_1fr_auto] items-center gap-2 text-[12px]" style={{ animationDelay: `${i * 60}ms` }}>
                  <span className="num font-mono">{ruDate(d.issue_date)}.{d.issue_date.slice(2, 4)}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-line"><span className="grow block h-full rounded-full bg-curve" style={{ width: `${Math.round(d.similarity * 100)}%` }} /></span>
                  <span className="num text-right text-mute">{d.energy_mwh} {t('mwh')} · {d.mean_wind} м/с</span>
                </li>))}
            </ul>
            <p className="mt-2 text-[11px] text-mute">{t('mem_desc')}</p>
          </>)}
      </div>
    </section>
  )
}
