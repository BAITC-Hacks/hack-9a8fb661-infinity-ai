import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { AgentEvent } from '../api/types'
import { ruDate } from '../lib/format'

export interface Step { label: string; done: boolean }
export interface Msg { id: number; role: 'user' | 'agent'; text: string; steps: Step[]; error?: boolean }

let seq = 1

/** Человеческое описание вызова инструмента вместо сырого лога. */
function stepLabel(name: string, args: Record<string, unknown>): string {
  const d = typeof args.issue_date === 'string' ? ruDate(args.issue_date) : ''
  switch (name) {
    case 'get_forecast': return `Смотрю прогноз на ${d}`
    case 'get_metrics': return 'Проверяю точность модели'
    case 'get_agent_log': return `Разбираю решения за ${d}`
    case 'run_forecast': return `Пересчитываю прогноз на ${d}`
    default: return 'Собираю данные'
  }
}

export function useAgentStream(onDone?: () => void) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [full, setFull] = useState('')        // полный текст текущего ответа
  const [shown, setShown] = useState(0)       // сколько символов уже «напечатано»
  const [busy, setBusy] = useState(false)
  const es = useRef<EventSource | null>(null)

  const patchLast = (f: (m: Msg) => Msg) => setMsgs((xs) => xs.map((m, i) => (i === xs.length - 1 ? f(m) : m)))

  useEffect(() => {
    if (shown >= full.length) return
    const id = setTimeout(() => {
      const n = Math.min(full.length, shown + 4)
      setShown(n)
      patchLast((m) => ({ ...m, text: full.slice(0, n) }))
    }, 14)
    return () => clearTimeout(id)
  }, [full, shown])

  const ask = useCallback((question: string) => {
    es.current?.close()
    setFull(''); setShown(0); setBusy(true)
    setMsgs((xs) => [...xs, { id: seq++, role: 'user', text: question, steps: [] },
      { id: seq++, role: 'agent', text: '', steps: [] }])
    const src = new EventSource(api.agentStreamUrl(question))
    es.current = src
    src.onmessage = (e) => {
      const ev = JSON.parse(e.data) as AgentEvent
      if (ev.type === 'tool_call')
        patchLast((m) => ({ ...m, steps: [...m.steps, { label: stepLabel(ev.name, ev.args), done: false }] }))
      else if (ev.type === 'tool_result')
        patchLast((m) => ({ ...m, steps: m.steps.map((s, i) => (i === m.steps.length - 1 ? { ...s, done: true } : s)) }))
      else if (ev.type === 'answer') setFull(ev.text.replace(/^\[mock\]\s*/, '').replace(/\s*\[mock\]\s*/g, ' '))
      else if (ev.type === 'error') patchLast((m) => ({ ...m, text: `Не получилось: ${ev.text}`, error: true }))
      else if (ev.type === 'done') { src.close(); setBusy(false); onDone?.() }
    }
    src.onerror = () => {
      src.close(); setBusy(false)
      patchLast((m) => (m.text ? m : { ...m, text: 'Связь с агентом прервалась, попробуйте ещё раз.', error: true }))
    }
  }, [onDone])

  return { msgs, busy, ask }
}
