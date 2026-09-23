import { AnimatePresence, motion } from 'motion/react'
import { Bot, Loader2, Send, Terminal, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAgentStream } from '../hooks/useAgentStream'

const SUGGEST = ['Какое качество модели?', 'Прогноз на 12.02', 'Почему агент пересчитал 25.02?', 'Пересчитай 20.02']

export function AgentChat({ onChanged }: { onChanged: () => void }) {
  const { items, busy, ask } = useAgentStream(onChanged)
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.scrollTo({ top: 1e9, behavior: 'smooth' }) }, [items])

  const submit = (text: string) => {
    const t = text.trim()
    if (t.length < 2 || busy) return
    ask(t); setQ('')
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={box} className="scroll-thin flex max-h-[420px] min-h-40 flex-col gap-2 overflow-y-auto pr-1">
        {!items.length && (
          <div className="grid place-items-center py-10 text-center text-sm text-mute">
            <Bot className="mb-2 text-acc" />Агент сам вызывает инструменты: прогноз, метрики, журнал, пересчёт.
          </div>
        )}
        <AnimatePresence initial={false}>
          {items.map((m) => (
            <motion.div key={m.id} layout initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              className={m.role === 'user' ? 'self-end' : 'self-start'}>
              {m.role === 'tool' ? (
                <div className="flex items-center gap-2 px-2 font-mono text-[11px] text-sky"><Terminal size={12} />{m.text}</div>
              ) : (
                <div className={`flex max-w-[80ch] gap-2 rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user' ? 'bg-acc text-bg' : m.role === 'error' ? 'border border-bad/40 bg-bad/10 text-bad' : 'border border-line bg-panel-2'}`}>
                  {m.role === 'user' ? <User size={16} className="mt-0.5 shrink-0" /> : <Bot size={16} className="mt-0.5 shrink-0 text-acc" />}
                  <span>{m.text}</span>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && <div className="flex items-center gap-2 px-2 text-xs text-mute"><Loader2 size={12} className="animate-spin" />агент думает…</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(q) }} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500}
          placeholder="Спросите агента: почему 12.02 низкая выработка?"
          className="flex-1 rounded-xl border border-line bg-bg/60 px-4 py-2.5 text-sm outline-none transition focus:border-acc" />
        <motion.button whileTap={{ scale: 0.95 }} disabled={busy} className="flex items-center gap-2 rounded-xl bg-acc px-4 font-semibold text-bg disabled:opacity-50">
          <Send size={16} />Спросить
        </motion.button>
      </form>
      <div className="flex flex-wrap gap-2">
        {SUGGEST.map((s) => (
          <button key={s} onClick={() => submit(s)} className="rounded-full border border-line px-3 py-1 text-xs text-mute transition hover:border-acc hover:text-text">{s}</button>
        ))}
      </div>
    </div>
  )
}
