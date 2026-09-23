import { useCallback, useRef, useState } from 'react'
import { api } from '../api/client'
import type { AgentEvent } from '../api/types'

export interface ChatItem {
  id: number
  role: 'user' | 'tool' | 'agent' | 'error'
  text: string
}

let nextId = 1

export function useAgentStream(onDone?: () => void) {
  const [items, setItems] = useState<ChatItem[]>([])
  const [busy, setBusy] = useState(false)
  const es = useRef<EventSource | null>(null)

  const push = (role: ChatItem['role'], text: string) =>
    setItems((xs) => [...xs, { id: nextId++, role, text }])

  const ask = useCallback((question: string) => {
    es.current?.close()
    push('user', question)
    setBusy(true)
    const src = new EventSource(api.agentStreamUrl(question))
    es.current = src
    src.onmessage = (e) => {
      const ev = JSON.parse(e.data) as AgentEvent
      if (ev.type === 'tool_call') push('tool', `${ev.name}(${JSON.stringify(ev.args)})`)
      else if (ev.type === 'answer') push('agent', ev.text)
      else if (ev.type === 'error') push('error', ev.text)
      else if (ev.type === 'done') { src.close(); setBusy(false); onDone?.() }
    }
    src.onerror = () => { src.close(); setBusy(false) }
  }, [onDone])

  return { items, busy, ask }
}
