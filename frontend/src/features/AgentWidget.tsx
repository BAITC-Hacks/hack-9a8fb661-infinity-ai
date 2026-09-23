import { Check, HardHat, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAgentStream } from '../hooks/useAgentStream'
import { useT } from '../lib/i18n'

/** Агент-инженер в правом нижнем углу: обычный чат, шаги работы — человеческим языком. */
export function AgentWidget({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const { t, d, lang } = useT()
  const { msgs, busy, ask } = useAgentStream(d, lang, onChanged)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [msgs])

  const submit = (text: string) => {
    const t = text.trim()
    if (t.length >= 2 && !busy) { ask(t); setQ('') }
  }

  return (
    <>
      <div className={`fixed right-5 bottom-24 z-40 flex h-[min(560px,calc(100vh-8rem))] w-[min(420px,calc(100vw-2.5rem))] origin-bottom-right flex-col rounded-[10px] border border-line bg-panel transition-all duration-300 ease-out ${open ? 'scale-100 opacity-100' : 'pointer-events-none translate-y-3 scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-blue/15 text-blue"><HardHat size={17} /></span>
            <div>
              <div className="text-sm font-semibold">{t('agent')}</div>
              <div className="text-xs text-mute">{busy ? t('working') : t('online')}</div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Закрыть" className="text-mute transition-colors hover:text-text"><X size={18} /></button>
        </div>

        <div ref={box} className="scroll-thin flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {!msgs.length && (
            <div className="pop pt-6 text-center">
              <p className="text-base">{t('ask_hint')}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {d.chips.map((c) => (
                  <button key={c} onClick={() => submit(c)}
                    className="rounded-[20px] border border-line px-3 py-1 text-[13px] text-mute transition-colors hover:border-blue hover:text-text">{c}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m) => m.role === 'user' ? (
            <div key={m.id} className="pop flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-blue/15 px-3.5 py-2 text-[15px]">{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="pop space-y-1.5">
              {m.steps.map((s, i) => (
                <div key={i} className="pop flex items-center gap-2 text-[13px] text-mute">
                  {s.done ? <Check size={14} className="text-good" /> : <Loader2 size={14} className="animate-spin text-blue" />}
                  {s.label}
                </div>
              ))}
              {m.text ? (
                <div className={`max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-bg px-3.5 py-2.5 text-[15px] leading-relaxed ${m.error ? 'text-warn' : ''}`}>{m.text}</div>
              ) : (
                <div className="flex gap-1 px-1 py-2"><i className="dot size-1.5 rounded-full bg-mute" /><i className="dot size-1.5 rounded-full bg-mute" /><i className="dot size-1.5 rounded-full bg-mute" /></div>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); submit(q) }} className="flex gap-2 border-t border-line p-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder={t('ask_ph')}
            className="field flex-1 text-[15px]" />
          <button disabled={busy} className="rounded-lg bg-blue px-4 text-sm font-semibold text-ink transition-opacity disabled:opacity-50">{t('ask')}</button>
        </form>
      </div>

      <button onClick={() => setOpen((o) => !o)} aria-label={t('agent')}
        className={`fixed right-5 bottom-5 z-40 grid size-14 place-items-center rounded-full border bg-panel transition-all duration-200 hover:scale-105 ${open ? 'border-blue text-blue' : 'pulse border-blue/60 text-text'}`}>
        {open ? <X size={24} /> : <HardHat size={26} />}
      </button>
    </>
  )
}
