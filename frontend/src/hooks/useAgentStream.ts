import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { AgentEvent } from '../api/types'
import { ruDate } from '../lib/format'
import type { Dict } from '../lib/i18n'

export interface Step { label: string; done: boolean }
export interface Msg { id: number; role: 'user' | 'agent'; text: string; steps: Step[]; error?: boolean }

let seq = 1

/** Человеческое описание вызова инструмента вместо сырого лога. */
function stepLabel(d: Dict, name: string, args: Record<string, unknown>): string {
  const date = typeof args.issue_date === 'string' ? ruDate(args.issue_date) : ''
  const key = ({ get_forecast: 's_forecast', get_metrics: 's_metrics', get_agent_log: 's_log', run_forecast: 's_run' } as const)[name] ?? 's_other'
  return (d[key] as string).replace('{d}', date)
}

export function useAgentStream(d: Dict, lang: string, onDone?: () => void) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [full, setFull] = useState('')
  const [shown, setShown] = useState(0)
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
    const src = new EventSource(api.agentStreamUrl(question, lang))
    es.current = src
    src.onmessage = (e) => {
      const ev = JSON.parse(e.data) as AgentEvent
      if (ev.type === 'tool_call')
        patchLast((m) => ({ ...m, steps: [...m.steps, { label: stepLabel(d, ev.name, ev.args), done: false }] }))
      else if (ev.type === 'tool_result')
        patchLast((m) => ({ ...m, steps: m.steps.map((s, i) => (i === m.steps.length - 1 ? { ...s, done: true } : s)) }))
      else if (ev.type === 'answer') setFull(ev.text.replace(/^\[mock\]\s*/, '').replace(/\s*\[mock\]\s*/g, ' '))
      else if (ev.type === 'error') patchLast((m) => ({ ...m, text: `${d.a_fail}: ${ev.text}`, error: true }))
      else if (ev.type === 'done') { src.close(); setBusy(false); onDone?.() }
    }
    src.onerror = () => {
      src.close(); setBusy(false)
      patchLast((m) => (m.text ? m : { ...m, text: d.a_lost, error: true }))
    }
  }, [onDone, d, lang])

  return { msgs, busy, ask }
}
