import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { TurbineId } from '../../api/types'
import { useT } from '../../lib/i18n'

export type View = 'chart' | 'table'
export type Mode = 'then' | 'eval'
export const ISSUE_MIN = '2026-01-01'
export const ISSUE_MAX = '2026-02-27'

interface Props {
  turbine: TurbineId; onTurbine: (t: TurbineId) => void
  horizon: 24 | 48; onHorizon: (h: 24 | 48) => void
  issueDate: string; onIssue: (d: string) => void
  view: View; onView: (v: View) => void
  mode: Mode; onMode: (m: Mode) => void
}

const shift = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

/** Полоса фильтров: подпись капсом 10px + контрол 30px, всё в одну строку. */
export function FilterBar(p: Props) {
  const { t } = useT()
  const setIssue = (d: string) => { if (d >= ISSUE_MIN && d <= ISSUE_MAX) p.onIssue(d) }
  return (
    <div className="flex flex-wrap items-end gap-5 border-b border-line bg-panel px-4 py-2.5">
      <Field label={t('f_object')}>
        <div className="seg">
          {([['STATION', t('station')], ['T1', t('t1')], ['T2', t('t2')]] as [TurbineId, string][]).map(([id, l]) => (
            <button key={id} className={p.turbine === id ? 'on' : ''} onClick={() => p.onTurbine(id)}>{l}</button>))}
        </div>
      </Field>
      <Field label={t('f_horizon')}>
        <div className="seg">
          {([24, 48] as const).map((h) => <button key={h} className={p.horizon === h ? 'on' : ''} onClick={() => p.onHorizon(h)}>{h === 24 ? t('h24') : t('h48')}</button>)}
        </div>
      </Field>
      <Field label={t('f_issue')}>
        <div className="seg">
          <button onClick={() => setIssue(shift(p.issueDate, -1))} disabled={p.issueDate <= ISSUE_MIN} aria-label="−1"><ChevronLeft size={14} /></button>
          <input type="date" value={p.issueDate} min={ISSUE_MIN} max={ISSUE_MAX} onChange={(e) => e.target.value && setIssue(e.target.value)}
            className="num h-full border-x border-line bg-bg px-2 text-[13px] text-text outline-none" />
          <button onClick={() => setIssue(shift(p.issueDate, 1))} disabled={p.issueDate >= ISSUE_MAX} aria-label="+1"><ChevronRight size={14} /></button>
        </div>
      </Field>
      <Field label={t('f_mode')}>
        <div className="seg">
          <button className={p.mode === 'then' ? 'on' : ''} onClick={() => p.onMode('then')}>{t('mode_then')}</button>
          <button className={p.mode === 'eval' ? 'on' : ''} onClick={() => p.onMode('eval')}>{t('mode_eval')}</button>
        </div>
      </Field>
      <Field label={t('f_view')}>
        <div className="seg">
          <button className={p.view === 'chart' ? 'on' : ''} onClick={() => p.onView('chart')}>{t('chart')}</button>
          <button className={p.view === 'table' ? 'on' : ''} onClick={() => p.onView('table')}>{t('table')}</button>
        </div>
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><span className="lbl">{label}</span>{children}</div>
}
