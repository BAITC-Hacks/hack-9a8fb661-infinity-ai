import { BarChart3, Brain, Check, CloudDownload, FileText, Loader2, Microscope, RefreshCw, Sparkles, Wrench } from 'lucide-react'
import type { Step } from '../hooks/useAgentStream'
import { useState } from 'react'
import type { AgentLogEntry } from '../api/types'
import { useT } from '../lib/i18n'

const ICON: Record<string, React.ReactNode> = {
  fetch_forecast: <CloudDownload size={13} />, prepare_features: <Wrench size={13} />, train_model: <Brain size={13} />,
  predict: <Sparkles size={13} />, analyze: <Microscope size={13} />, evaluate: <BarChart3 size={13} />,
  replan: <RefreshCw size={13} />, report: <FileText size={13} />,
}

/** Компактная лента цикла агента: одна строка на шаг, человеческим языком, раскрытие по клику. */
export function PipelineRail({ log, issueDate, live, busy, thinking }: { log: AgentLogEntry[]; issueDate: string; live?: Step[]; busy?: boolean; thinking?: boolean }) {
  const { t } = useT()
  const [open, setOpen] = useState<number | null>(null)
  // последний прогон: с последнего fetch_forecast
  const lastStart = log.map((e) => e.tool).lastIndexOf('fetch_forecast')
  const steps = lastStart >= 0 ? log.slice(lastStart) : log
  const label = (e: AgentLogEntry): string => {
    const r = (e.result ?? {}) as Record<string, number | string | boolean>
    switch (e.tool) {
      case 'fetch_forecast': return t('st_fetch', { w: Number(r.mean_wind_100m ?? 0).toFixed(1) })
      case 'prepare_features': return t('st_prep', { g: Number(r.max_fact_gap_h ?? 0) > 0 ? t('st_prep_gap', { h: String(r.max_fact_gap_h) }) : t('st_prep_ok') })
      case 'train_model': return t('st_train', { d: String((e.params as Record<string, string>)?.until ?? '').slice(0, 10) })
      case 'predict': return t('st_predict')
      case 'analyze': return t('st_analyze', { m: Math.round(Number(r.mean_p ?? 0) * 100), p: Math.round(Number(r.max_p ?? 0) * 100) })
      case 'evaluate': { const a = Array.isArray(e.result) ? (e.result as Record<string, number>[])[0] : null
        return a ? t('st_eval', { mae: a.mae.toFixed(3), base: a.mae_base.toFixed(3) }) : t('st_eval', { mae: '—', base: '—' }) }
      case 'replan': return `${t('st_replan')}: ${e.reason ?? ''}`
      case 'report': return t('st_report')
      default: return e.tool
    }
  }
  return (
    <aside className="space-y-3 self-start">
      {(busy || (live && live.length > 0)) && (
        <section className={`panel !p-0 ${busy ? 'border-blue/60' : ''}`}>
          <div className="flex h-[40px] items-center gap-2 border-b border-line bg-sunk px-3">
            {busy ? <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-blue opacity-70" /><span className="relative inline-flex size-2.5 rounded-full bg-blue" /></span>
              : <Check size={14} className="text-good" />}
            <span className="text-[13px] font-semibold">{busy ? t('working') : t('done')}</span>
            {busy && thinking && <span className="ml-auto flex items-center gap-1 text-[11px] text-curve"><Brain size={12} className="animate-pulse" />{t('m_deep_d')}</span>}
          </div>
          <ol className="space-y-1 p-3">
            {(live ?? []).length > 5 && <li className="text-[11px] text-mute">{t('steps_n', { n: (live ?? []).length })} · {t('steps_more', { n: (live ?? []).length - 5 })} ↑</li>}
            {(live ?? []).slice(-5).map((s, i) => (
              <li key={i} className="pop flex items-center gap-2 text-[12.5px]" style={{ animationDelay: `${i * 60}ms` }}>
                {s.done ? <Check size={13} className="shrink-0 text-good" /> : <Loader2 size={13} className="shrink-0 animate-spin text-blue" />}
                <span className={s.done ? 'text-mute' : 'text-text'}>{s.label}</span>
              </li>))}
            {busy && !(live ?? []).some((s) => !s.done) && (
              <li className="flex items-center gap-2 text-[12.5px] text-mute"><span className="flex gap-1"><i className="dot size-1.5 rounded-full bg-blue" /><i className="dot size-1.5 rounded-full bg-blue" /><i className="dot size-1.5 rounded-full bg-blue" /></span>{thinking ? t('m_deep_d') : t('working')}</li>)}
          </ol>
        </section>)}
      <section className="panel !p-0">
      <div className="flex h-[40px] items-center gap-2 border-b border-line bg-sunk px-3">
        <span className="text-[13px] font-semibold">{t('pipeline')}</span><span className="mono ml-auto text-mute">{issueDate}</span>
      </div>
      <ol className="relative p-3 before:absolute before:bottom-5 before:left-[23px] before:top-5 before:w-px before:bg-line">
        {steps.map((e, i) => {
          const warn = !!e.reason
          const text = e.tool === 'report' ? String((e.result as { text?: string })?.text ?? '').replace(/\[mock\]\s*/g, '') : e.reason
          return (
            <li key={e.id} className="pop relative" style={{ animationDelay: `${i * 90}ms` }}>
              <span className="rail-sweep pointer-events-none absolute inset-0 rounded-md" style={{ animationDelay: `${i * 0.6}s`, animationDuration: `${steps.length * 0.6}s` }} />
              <button onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-start gap-2.5 rounded-md py-1.5 pr-1 text-left hover:bg-sunk">
                <span className={`relative z-10 mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full border bg-panel ${warn ? 'border-warn/60 text-warn' : 'border-blue/50 text-blue'}`}>{ICON[e.tool] ?? <Sparkles size={13} />}</span>
                <span className="min-w-0 flex-1 text-[12.5px] leading-snug">{label(e)}</span>
                <span className="mono shrink-0 text-mute">{e.ts.slice(11, 16)}</span>
              </button>
              {open === e.id && text && <p className="pop mb-1 ml-8 rounded-md bg-sunk px-2.5 py-1.5 text-[12px] leading-relaxed text-mute">{text}</p>}
            </li>)
        })}
      </ol>
      </section>
    </aside>
  )
}
