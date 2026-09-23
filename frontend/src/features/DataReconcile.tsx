import { CheckCircle2 } from 'lucide-react'
import type { DataSummary } from '../api/types'
import { useT } from '../lib/i18n'

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('ru-RU'))

/** Сверка: 10-минутные строки дата-инженера → часы → обучение. */
export function DataReconcile({ d, error }: { d: DataSummary | null; error: string | null }) {
  const { t } = useT()
  if (error) return <p className="text-[13px] text-bad">{t('err')}: {error}</p>
  if (!d) return <div className="shimmer h-40 rounded-lg" />
  const rows: { k: string; v: (o: DataSummary['objects'][number]) => React.ReactNode }[] = [
    { k: t('dr_period'), v: (o) => `${o.from?.slice(0, 10)} — ${o.to?.slice(0, 10)}` },
    { k: t('dr_rows'), v: (o) => n(o.rows_10min) },
    { k: t('dr_expected'), v: (o) => n(o.expected_10min) },
    { k: t('dr_missing'), v: (o) => <span>{n(o.missing_10min)} {o.gap_slots === o.missing_10min && <CheckCircle2 size={13} className="inline text-good" />}</span> },
    { k: t('dr_gaps'), v: (o) => `${o.gaps} · ${n(o.gap_slots)} × 10 мин · ${o.gap_hours} ч` },
    { k: t('dr_hours'), v: (o) => `${n(o.hours)} (${t('dr_down')} ${o.downtime_hours})` },
    { k: t('dr_train'), v: (o) => `${n(o.train_hours)} · ${o.train_from} →` },
  ]
  return (
    <div className="panel !p-0">
      <table className="num w-full text-[13px]">
        <thead className="text-[10px] uppercase tracking-wider text-mute">
          <tr><th className="border-b border-line px-3 py-2 text-left font-medium" />{d.objects.map((o) => <th key={o.object_id} className="border-b border-line px-3 py-2 text-right font-medium">{o.name}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className="border-b border-line/60">
              <td className="px-3 py-2 text-mute">{r.k}</td>
              {d.objects.map((o) => <td key={o.object_id} className="px-3 text-right">{r.v(o)}</td>)}
            </tr>))}
        </tbody>
      </table>
      <p className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-good"><CheckCircle2 size={12} />{t('dr_match')} · {d.storage} · {d.tz_source}</p>
    </div>
  )
}
