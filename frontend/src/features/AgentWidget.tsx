import { HardHat, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AgentLogEntry } from '../api/types'
import { useAgentStream, type ToolLine } from '../hooks/useAgentStream'

const CHIPS = ['Качество модели?', 'Прогноз на 12.02', 'Почему пересчёт 25.02?']

/** Агент-инженер в правом нижнем углу: вопрос → журнал инструментов → ответ. */
export function AgentWidget({ pipelineLog, onChanged }: { pipelineLog: AgentLogEntry[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const { lines, answer, error, busy, ask } = useAgentStream(onChanged)
  const logBox = useRef<HTMLDivElement>(null)

  // пока вопросов не было — показываем шаги агентного цикла выбранного выпуска
  const shown: ToolLine[] = lines.length ? lines : pipelineLog.map((e) => ({
    id: e.id, name: e.tool, args: e.params ? JSON.stringify(e.params).slice(0, 200) : '',
    result: e.reason ?? (e.result ? JSON.stringify(e.result).slice(0, 200) : undefined),
  }))

  useEffect(() => { logBox.current?.scrollTo({ top: logBox.current.scrollHeight }) }, [shown.length, lines])

  const submit = (text: string) => {
    const t = text.trim()
    if (t.length >= 2 && !busy) { ask(t); setQ('') }
  }

  return (
    <>
      {open && (
        <div className="fixed right-5 bottom-24 z-40 flex max-h-[calc(100vh-8rem)] w-[min(440px,calc(100vw-2.5rem))] flex-col gap-3 rounded-[10px] border border-line bg-panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold"><HardHat size={18} className="text-blue" />Агент</h2>
            <button onClick={() => setOpen(false)} aria-label="Закрыть" className="text-mute hover:text-text"><X size={18} /></button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); submit(q) }} className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Вопрос агенту"
              className="field flex-1 text-base" />
            <button disabled={busy} className="rounded-lg bg-blue px-4 font-semibold text-ink disabled:opacity-50">Спросить</button>
          </form>

          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button key={c} onClick={() => submit(c)}
                className="rounded-[20px] border border-line px-3 py-1 text-[13px] text-mute hover:border-blue hover:text-text">{c}</button>
            ))}
          </div>

          <div ref={logBox} className="scroll-thin max-h-56 space-y-1.5 overflow-y-auto">
            {shown.map((l) => (
              <div key={l.id} className="rounded-md border-l-[3px] border-blue bg-bg px-2.5 py-1.5 font-mono text-[13px] leading-snug">
                <div className="truncate">→ {l.name}({l.args})</div>
                {l.result && <div className="truncate text-mute">← {l.result}</div>}
              </div>
            ))}
            {!shown.length && <p className="text-sm text-mute">Журнал пуст.</p>}
          </div>

          {error && <p className="text-sm text-warn">{error}</p>}
          {(answer || busy) && <p className="text-base leading-relaxed">{answer || '…'}</p>}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-label="Агент-инженер"
        className={`fixed right-5 bottom-5 z-40 grid size-14 place-items-center rounded-full border bg-panel ${open ? 'border-blue text-blue' : 'border-line text-text hover:border-blue'}`}>
        <HardHat size={26} />
      </button>
    </>
  )
}
