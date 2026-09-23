import { Brain, Check, ChevronRight, Gauge, Loader2, RotateCcw, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AgentMode, Msg } from '../hooks/useAgentStream'
import { useT } from '../lib/i18n'

interface Props {
  msgs: Msg[]; busy: boolean; ask: (q: string) => void; mode: AgentMode; setMode: (m: AgentMode) => void; reset: () => void; compact?: boolean
}

/** Общий вид чата (виджет и страница): переключатель режимов, шаги агента, «Думал N с», ответ. */
export function ChatView({ msgs, busy, ask, mode, setMode, reset, compact }: Props) {
  const { t, d } = useT()
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [msgs])
  const submit = (s: string) => { const x = s.trim(); if (x.length >= 1 && !busy) { ask(x); setQ('') } }
  const modes: { id: AgentMode; icon: React.ReactNode; label: string; hint: string }[] = [
    { id: 'fast', icon: <Zap size={13} />, label: t('m_fast'), hint: t('m_fast_d') },
    { id: 'medium', icon: <Gauge size={13} />, label: t('m_medium'), hint: t('m_medium_d') },
    { id: 'deep', icon: <Brain size={13} />, label: t('m_deep'), hint: t('m_deep_d') },
  ]
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={box} className={`scroll-thin flex-1 space-y-3 overflow-y-auto ${compact ? 'px-4 py-3' : 'p-4'}`}>
        {!msgs.length && (
          <div className="pop pt-6 text-center">
            <p className="text-base">{t('ask_hint')}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {d.chips.map((c) => <button key={c} onClick={() => submit(c)} className="rounded-[20px] border border-line px-3 py-1 text-[13px] text-mute transition-colors hover:border-blue hover:text-text">{c}</button>)}
            </div>
          </div>)}
        {msgs.map((m) => m.role === 'user' ? (
          <div key={m.id} className="pop flex justify-end"><div className={`${compact ? 'max-w-[85%]' : 'max-w-[70%]'} whitespace-pre-line rounded-2xl rounded-br-md bg-blue/15 px-3.5 py-2 text-[15px]`}>{m.text}</div></div>
        ) : (
          <div key={m.id} className="pop space-y-1.5">
            {m.steps.map((s, i) => <div key={i} className="flex items-center gap-2 text-[13px] text-mute">{s.done ? <Check size={14} className="text-good" /> : <Loader2 size={14} className="animate-spin text-blue" />}{s.label}</div>)}
            {m.thinking && (
              <details className="group rounded-lg border border-line/70 bg-sunk px-3 py-1.5 text-[12px] text-mute">
                <summary className="flex cursor-pointer list-none items-center gap-1.5"><Brain size={13} className="text-curve" /><ChevronRight size={12} className="transition-transform group-open:rotate-90" />{t('thought', { s: m.thinking.seconds })}</summary>
                <p className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-line leading-relaxed">{m.thinking.text}</p>
              </details>)}
            {m.text ? <div className={`${compact ? 'max-w-[95%]' : 'max-w-[80%]'} whitespace-pre-line rounded-2xl rounded-bl-md border border-line bg-bg px-3.5 py-2.5 text-[15px] leading-relaxed ${m.error ? 'text-warn' : ''}`}>{m.text.replace(/\*\*(.+?)\*\*/g, '$1')}</div>
              : <div className="flex items-center gap-2 px-1 py-2 text-[12px] text-mute">
                  <span className="flex gap-1"><i className="dot size-1.5 rounded-full bg-mute" /><i className="dot size-1.5 rounded-full bg-mute" /><i className="dot size-1.5 rounded-full bg-mute" /></span>
                  {m.mode === 'deep' ? t('m_deep_d') : m.mode === 'medium' ? t('m_medium_d') : ''}</div>}
          </div>))}
      </div>
      <div className="border-t border-line p-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="seg !h-7">
            {modes.map((x) => <button key={x.id} title={x.hint} className={`flex items-center gap-1 ${mode === x.id ? 'on' : ''}`} onClick={() => setMode(x.id)}>{x.icon}{x.label}</button>)}
          </div>
          {msgs.length > 0 && <button onClick={reset} title={t('new_chat')} className="ml-auto flex items-center gap-1 text-[12px] text-mute hover:text-text"><RotateCcw size={12} />{t('new_chat')}</button>}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); submit(q) }} className="flex gap-2">
          <textarea value={q} onChange={(e) => setQ(e.target.value)} maxLength={1000} rows={1} placeholder={t('ask_ph')}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(q) } }}
            className="field max-h-32 min-h-[40px] flex-1 resize-none py-2 text-[15px]" />
          <button disabled={busy || !q.trim()} className="rounded-lg bg-blue px-4 text-sm font-semibold text-ink disabled:opacity-50">{t('ask')}</button>
        </form>
      </div>
    </div>
  )
}
