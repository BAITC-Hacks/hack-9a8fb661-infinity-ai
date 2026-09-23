import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { AgentEvent } from '../api/types'
import { ruDate } from '../lib/format'
import type { Dict } from '../lib/i18n'

export type AgentMode = 'fast' | 'medium' | 'deep'
export interface Step { label: string; done: boolean }
export interface Attached { id: string; name: string; kind: string }
export interface Msg { id: number; role: 'user' | 'agent'; text: string; steps: Step[]; error?: boolean; thinking?: { text: string; seconds: number }; mode?: AgentMode; files?: Attached[]; question?: string; done?: boolean; retry?: { question: string; files: Attached[] } }

let seq = 1
const newSession = () => Math.random().toString(36).slice(2, 12)

function stepLabel(d: Dict, name: string, args: Record<string, unknown>): string {
  const date = typeof args.issue_date === 'string' ? ruDate(args.issue_date) : ''
  const key = ({ get_forecast: 's_forecast', get_metrics: 's_metrics', get_agent_log: 's_log', run_forecast: 's_run', get_alerts: 's_alerts', search_knowledge: 's_kb', get_period_summary: 's_period', find_analogs: 's_analogs' } as const)[name] ?? 's_other'
  return ((d as Record<string, unknown>)[key] as string ?? d.s_other).replace('{d}', date)
}

/** Диалог с агентом: режим (быстрый/средний/думающий), память сессии, контекст экрана. */
export function useAgentStream(d: Dict, lang: string, onDone?: () => void, context?: { issue_date?: string; turbine?: string },
  initial?: { session: string; msgs: Msg[] }, onChange?: (msgs: Msg[]) => void) {
  const [msgs, setMsgs] = useState<Msg[]>(initial?.msgs ?? [])
  const [full, setFull] = useState('')
  const [shown, setShown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<AgentMode>('fast')
  const session = useRef(initial?.session ?? newSession())
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange
  useEffect(() => { if (!busy) onChangeRef.current?.(msgs) }, [msgs, busy])
  const es = useRef<EventSource | null>(null)
  const ctxRef = useRef(context); ctxRef.current = context

  const patchLast = (f: (m: Msg) => Msg) => setMsgs((xs) => xs.map((m, i) => (i === xs.length - 1 ? f(m) : m)))

  useEffect(() => {
    if (shown >= full.length) return
    const id = setTimeout(() => {
      const n = Math.min(full.length, shown + 5)
      setShown(n)
      patchLast((m) => ({ ...m, text: full.slice(0, n) }))
    }, 12)
    return () => clearTimeout(id)
  }, [full, shown])

  const ask = useCallback((question: string, files: Attached[] = []) => {
    es.current?.close()
    setFull(''); setShown(0); setBusy(true)
    setMsgs((xs) => [...xs, { id: seq++, role: 'user', text: question, steps: [], files }, { id: seq++, role: 'agent', text: '', steps: [], mode, question }])
    const url = api.agentStreamUrl(question, { lang, mode, session: session.current, ...(ctxRef.current ?? {}), files: files.map((f) => f.id).join(',') })
    let gotAnswer = false, retries = 0
    const open = () => {
    const src = new EventSource(url)
    es.current = src
    src.onmessage = (e) => {
      const ev = JSON.parse(e.data) as AgentEvent
      if (ev.type === 'tool_call')
        patchLast((m) => ({ ...m, steps: [...m.steps, { label: stepLabel(d, ev.name, ev.args), done: false }] }))
      else if (ev.type === 'tool_result')
        patchLast((m) => ({ ...m, steps: m.steps.map((s, i) => (i === m.steps.length - 1 ? { ...s, done: true } : s)) }))
      else if (ev.type === 'thinking') patchLast((m) => ({ ...m, thinking: { text: ev.text, seconds: ev.seconds } }))
      else if (ev.type === 'answer') { gotAnswer = true; setFull(ev.text.replace(/^\[mock\]\s*/, '').replace(/\s*\[mock\]\s*/g, ' ')) }
      else if (ev.type === 'error') patchLast((m) => ({ ...m, text: `${d.a_fail}: ${ev.text}`, error: true }))
      else if (ev.type === 'done') { src.close(); setBusy(false); patchLast((m) => ({ ...m, done: true })); onDone?.() }
    }
    src.onerror = () => {
      src.close()
      if (!gotAnswer && retries < 2) {           // короткий сбой сети или перезапуск сервера — тихий повтор
        retries += 1
        patchLast((m) => ({ ...m, steps: [] }))
        setTimeout(open, 2500)
        return
      }
      setBusy(false)
      patchLast((m) => (m.text ? m : { ...m, text: d.a_lost, error: true, retry: { question, files } }))
    }
    }
    open()
  }, [onDone, d, lang, mode])

  const reset = useCallback(() => { es.current?.close(); setMsgs([]); setBusy(false); session.current = newSession() }, [])
  return { msgs, busy, ask, mode, setMode, reset, session: session.current, context: ctxRef.current }
}
