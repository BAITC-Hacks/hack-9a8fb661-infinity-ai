import { AlertTriangle, Bot, Snowflake, TrendingDown, TrendingUp, Wind, WindArrowDown } from 'lucide-react'
import type { Alert, Passport } from '../api/types'
import { ddmm, hhmm } from '../lib/format'
import { useT } from '../lib/i18n'
import { PassportCard } from './PassportCard'

const ICON: Record<Alert['kind'], React.ReactNode> = {
  ramp_up: <TrendingUp size={15} />, ramp_down: <TrendingDown size={15} />, calm: <WindArrowDown size={15} />,
  cutout: <Wind size={15} />, icing: <Snowflake size={15} />, confidence: <AlertTriangle size={15} />, agent: <Bot size={15} />,
}
const TONE: Record<Alert['level'], string> = { critical: 'border-bad/60 text-bad', warn: 'border-warn/60 text-warn', info: 'border-blue/50 text-blue' }

/** Правая колонка: вывод агента по выпуску и уведомления (резкие изменения, штиль, риски, решения агента). */
export function AlertsPanel({ alerts, summary, passport, llm, loading }: { alerts: Alert[]; summary: string | null; passport: Passport | null; llm: string; loading: boolean }) {
  const { t } = useT()
  const text = (summary ?? '').replace(/\[mock\]\s*/g, '')
  return (
    <aside className="panel !p-0 self-start">
      <div className="flex h-[44px] items-center gap-2 border-b border-line bg-sunk px-3">
        <Bot size={16} className="text-blue" /><span className="text-[14px] font-semibold">{t('alerts')}</span>
        <span className="mono ml-auto flex items-center gap-1.5 text-mute"><i className="dot size-1.5 rounded-full bg-good" />{t('live')} · {llm.split(' ')[0].replace('rules', 'правила')}</span>
      </div>
      <div className="scroll-thin max-h-[520px] space-y-2 overflow-y-auto p-2">
        {text && (
          <div className="pop rounded-md border border-line bg-sunk px-3 py-2.5">
            <div className="lbl mb-1">{t('agent_summary')}</div>
            <details className="group"><summary className="cursor-pointer list-none text-[13px] leading-relaxed"><span className="line-clamp-2 group-open:line-clamp-none">{text}</span></summary></details>
          </div>)}
        {loading && !alerts.length && <div className="shimmer h-16 rounded-md" />}
        {!loading && !alerts.length && <p className="px-2 py-4 text-[13px] text-mute">{t('no_alerts')}</p>}
        {alerts.map((a, i) => (
          <div key={i} className={`pop rounded-md border-l-[3px] bg-sunk px-3 py-2 ${TONE[a.level]}`} style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider">
              {ICON[a.kind]}<span>{t(`lvl_${a.level}` as 'lvl_info')}</span>
              {a.start && a.end && <span className="mono ml-auto normal-case tracking-normal text-mute">{ddmm(a.start)} {hhmm(a.start)}–{hhmm(a.end)}</span>}
              {a.delta_mw != null && <span className="num font-mono text-[12px]">{a.delta_mw > 0 ? '+' : ''}{a.delta_mw.toFixed(1)} МВт</span>}
            </div>
            <p className="mt-1 text-[13px] leading-snug text-text">{a.text}</p>
          </div>))}
        <details className="mt-1 border-t border-line pt-2">
          <summary className="lbl cursor-pointer px-2 py-1 hover:text-text">{t('passport')}</summary>
          <div className="mt-1"><PassportCard p={passport} error={null} /></div>
        </details>
      </div>
    </aside>
  )
}
