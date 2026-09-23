import { CheckCircle2, XCircle } from 'lucide-react'
import type { Experiments } from '../api/types'
import { bucketLabel, useT } from '../lib/i18n'

const USED = 'boost'

/** Таблица доказательств: вклад каждого варианта на январе, выбранный вариант отмечен. */
export function EvidencePanel({ e }: { e: Experiments | null }) {
  const { t } = useT()
  if (!e) return <div className="shimmer h-40 rounded-lg" />
  if (!e.rows.length) return <p className="text-[13px] text-mute">python -m app.cli experiments</p>
  const variants = [...new Map(e.rows.map((r) => [r.variant, r.name])).entries()]
  const cell = (v: string, b: string) => e.rows.find((r) => r.variant === v && r.bucket === b)
  const best = (b: string) => Math.min(...e.rows.filter((r) => r.bucket === b).map((r) => r.mae))
  return (
    <div className="panel !p-0">
      <table className="num w-full text-[13px]">
        <thead className="text-[10px] uppercase tracking-wider text-mute">
          <tr>
            <th className="border-b border-line px-3 py-2 text-left font-medium">{t('ev_variant')}</th>
            {['1-24h', '25-48h'].map((b) => <th key={b} className="border-b border-line px-3 py-2 text-right font-medium">MAE {bucketLabel(b, t)}</th>)}
            <th className="border-b border-line px-3 py-2 text-right font-medium">{t('ev_vs')}</th>
            <th className="border-b border-line px-3 py-2 text-right font-medium" />
          </tr>
        </thead>
        <tbody>
          {variants.map(([v, name], i) => {
            const a = cell(v, '1-24h'), b = cell(v, '25-48h')
            return (
              <tr key={v} className={`pop border-b border-line/60 ${v === USED ? 'bg-good/10' : ''}`} style={{ animationDelay: `${i * 60}ms` }}>
                <td className="px-3 py-2">{name}</td>
                {[a, b].map((c, j) => <td key={j} className={`px-3 text-right ${c && c.mae === best(j ? '25-48h' : '1-24h') ? 'font-semibold text-good' : ''}`}>{c ? c.mae.toFixed(3) : '—'}</td>)}
                <td className="px-3 text-right">{a ? `${(a.vs_persistence * 100).toFixed(0)}% / ${b ? (b.vs_persistence * 100).toFixed(0) : '—'}%` : '—'}</td>
                <td className="px-3 text-right text-[11px]">{v === USED ? <span className="flex items-center justify-end gap-1 text-good"><CheckCircle2 size={12} />{t('ev_used')}</span>
                  : v === 'curve' ? null : <span className="flex items-center justify-end gap-1 text-mute"><XCircle size={12} />{t('ev_rejected')}</span>}</td>
              </tr>)
          })}
        </tbody>
      </table>
    </div>
  )
}
