import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { AgentEvent } from '../api/types'

export interface ToolLine { id: number; name: string; args: string; result?: string }

let seq = 1
const clip = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** SSE-диалог с агентом: журнал вызовов инструментов + ответ, выводимый по мере поступления. */
export function useAgentStream(onDone?: () => void) {
  const [lines, setLines] = useState<ToolLine[]>([])
  const [answer, setAnswer] = useState('')
  const [shown, setShown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const es = useRef<EventSource | null>(null)

  useEffect(() => {
    if (shown >= answer.length) return
    const id = setTimeout(() => setShown((n) => Math.min(answer.length, n + 3)), 12)
    return () => clearTimeout(id)
  }, [answer, shown])

  const ask = useCallback((question: string) => {
    es.current?.close()
    setLines([]); setAnswer(''); setShown(0); setError(null); setBusy(true)
    const src = new EventSource(api.agentStreamUrl(question))
    es.current = src
    src.onmessage = (e) => {
      const ev = JSON.parse(e.data) as AgentEvent
      if (ev.type === 'tool_call')
        setLines((xs) => [...xs, { id: seq++, name: ev.name, args: clip(JSON.stringify(ev.args)) }])
      else if (ev.type === 'tool_result')
        setLines((xs) => xs.map((l, i) => (i === xs.length - 1 ? { ...l, result: clip(JSON.stringify(ev.result)) } : l)))
      else if (ev.type === 'answer') setAnswer(ev.text)
      else if (ev.type === 'error') setError(ev.text)
      else if (ev.type === 'done') { src.close(); setBusy(false); onDone?.() }
    }
    src.onerror = () => { src.close(); setBusy(false); setError((x) => x ?? 'Соединение с агентом прервано') }
  }, [onDone])

  return { lines, answer: answer.slice(0, shown), error, busy, ask }
}
