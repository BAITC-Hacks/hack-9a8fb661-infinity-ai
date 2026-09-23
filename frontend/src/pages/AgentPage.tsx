import { Check, HardHat, Loader2, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useAgentStream } from '../hooks/useAgentStream'
import { useAsync } from '../hooks/useAsync'
import type { Ctx } from '../lib/ctx'
import { useT } from '../lib/i18n'

const TITLE: Record<string, string> = {
  fetch_forecast: 'Погода Open-Meteo', prepare_features: 'Подготовка данных', train_model: 'Обучение модели',
  predict: 'Прогноз', analyze: 'Анализ результата', evaluate: 'Оценка', replan: 'Перепланирование', report: 'Отчёт LLM', error: 'Ошибка',
}

/** Страница агента: слева цикл агента для выбранного выпуска, справа полноэкранный диалог. */
export function AgentPage({ ctx }: { ctx: Ctx }) {
  const { t, d, lang } = useT()
  const { issueDate, tick, refresh, llm } = ctx
  const log = useAsync(() => api.log(issueDate), [issueDate, tick])
  const { msgs, busy, ask } = useAgentStream(d, lang, refresh)
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [msgs])
  const submit = (s: string) => { const x = s.trim(); if (x.length >= 2 && !busy) { ask(x); setQ('') } }
  return (
    <main className="grid gap-4 p-4 xl:grid-cols-[420px_1fr]">
      <section className="panel !p-0">
        <div className="flex h-[44px] items-center gap-2 border-b border-line bg-sunk px-3"><span className="text-[14px] font-semibold">{t('pipeline')}</span><span className="mono ml-auto text-mute">{issueDate}</span></div>
        <ol className="scroll-thin max-h-[640px] space-y-1 overflow-y-auto p-2">
          {(log.data ?? []).map((e, i) => (
            <li key={e.id} className="pop rounded-md border border-line/60 px-2.5 py-2" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-center gap-2 text-[13px]"><Zap size={13} className={e.reason ? 'text-warn' : 'text-blue'} /><span className="font-medium">{TITLE[e.tool] ?? e.tool}</span><span className="mono ml-auto text-mute">{e.ts.slice(11, 19)}</span></div>
              {e.reason && <div className="mt-1 text-[12px] text-warn">{e.reason}</div>}
              {e.tool === 'report' && e.result != null && <p className="mt-1 text-[13px] leading-relaxed">{String((e.result as { text?: string }).text ?? '').replace(/\[mock\]\s*/g, '')}</p>}
              {e.tool !== 'report' && e.result != null && <div className="mono mt-0.5 truncate text-mute">{JSON.stringify(e.result).slice(0, 140)}</div>}
            </li>))}
        </ol>
      </section>
      <section className="panel flex !p-0 flex-col">
        <div className="flex h-[44px] items-center gap-2 border-b border-line bg-sunk px-3"><HardHat size={16} className="text-blue" /><span className="text-[14px] font-semibold">{t('chat_page')}</span>
          <span className="mono ml-auto text-mute">{busy ? t('working') : t('online')} · {llm}</span></div>
        <div ref={box} className="scroll-thin min-h-[420px] flex-1 space-y-3 overflow-y-auto p-4">
          {!msgs.length && <div className="pop pt-8 text-center"><p className="text-base">{t('ask_hint')}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">{d.chips.map((c) => <button key={c} onClick={() => submit(c)} className="rounded-[20px] border border-line px-3 py-1 text-[13px] text-mute transition-colors hover:border-blue hover:text-text">{c}</button>)}</div></div>}
          {msgs.map((m) => m.role === 'user' ? (
            <div key={m.id} className="pop flex justify-end"><div className="max-w-[70%] rounded-2xl rounded-br-md bg-blue/15 px-3.5 py-2 text-[15px]">{m.text}</div></div>
          ) : (
            <div key={m.id} className="pop space-y-1.5">
              {m.steps.map((s, i) => <div key={i} className="flex items-center gap-2 text-[13px] text-mute">{s.done ? <Check size={14} className="text-good" /> : <Loader2 size={14} className="animate-spin text-blue" />}{s.label}</div>)}
              {m.text ? <div className={`max-w-[80%] whitespace-pre-line rounded-2xl rounded-bl-md border border-line bg-bg px-3.5 py-2.5 text-[15px] leading-relaxed ${m.error ? 'text-warn' : ''}`}>{m.text}</div>
                : <div className="flex gap-1 px-1 py-2"><i className="dot size-1.5 rounded-full bg-mute" /><i className="dot size-1.5 rounded-full bg-mute" /><i className="dot size-1.5 rounded-full bg-mute" /></div>}
            </div>))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); submit(q) }} className="flex gap-2 border-t border-line p-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder={t('ask_ph')} className="field flex-1 text-[15px]" />
          <button disabled={busy} className="rounded-lg bg-blue px-4 text-sm font-semibold text-ink disabled:opacity-50">{t('ask')}</button>
        </form>
      </section>
    </main>
  )
}
