import { HardHat, MessageSquare, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { ChatView } from '../features/ChatView'
import { AnalogsPanel } from '../features/AnalogsPanel'
import { PipelineRail } from '../features/PipelineRail'
import { useAgentStream, type Msg, type Step } from '../hooks/useAgentStream'
import { useAsync } from '../hooks/useAsync'
import type { Ctx } from '../lib/ctx'
import { llmLabel, useT } from '../lib/i18n'

interface Conv { id: string; session: string; title: string; updated: number; msgs: Msg[] }
const KEY = 'infinity-chats'
const load = (): Conv[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } }
const store = (c: Conv[]) => { try { localStorage.setItem(KEY, JSON.stringify(c.slice(0, 40))) } catch { /* хранилище недоступно */ } }
const fresh = (): Conv => { const id = Math.random().toString(36).slice(2, 12); return { id, session: id, title: '', updated: Date.now(), msgs: [] } }

/** Страница агента как в ChatGPT: слева чаты, по центру диалог, справа компактный цикл агента. */
export function AgentPage({ ctx }: { ctx: Ctx }) {
  const { t } = useT()
  const { issueDate, tick, llm } = ctx
  const [poll, setPoll] = useState(0)
  useEffect(() => { const id = setInterval(() => setPoll((x) => x + 1), 15000); return () => clearInterval(id) }, [])
  const log = useAsync(() => api.log(issueDate), [issueDate, tick, poll])
  const analogs = useAsync(() => api.analogs(issueDate, ctx.turbine), [issueDate, ctx.turbine])
  const [live, setLive] = useState<{ steps: Step[]; busy: boolean; thinking: boolean }>({ steps: [], busy: false, thinking: false })
  const [convs, setConvs] = useState<Conv[]>(() => { const c = load(); return c.length ? c : [fresh()] })
  const [active, setActive] = useState(convs[0].id)
  useEffect(() => store(convs), [convs])
  const conv = convs.find((c) => c.id === active) ?? convs[0]

  const newChat = () => { const c = fresh(); setConvs((xs) => [c, ...xs.filter((x) => x.msgs.length)]); setActive(c.id) }
  const remove = (id: string) => setConvs((xs) => { const r = xs.filter((x) => x.id !== id); const n = r.length ? r : [fresh()]; if (id === active) setActive(n[0].id); return n })
  const save = useCallback((id: string, msgs: Msg[]) => setConvs((xs) => xs.map((x) => x.id !== id ? x
    : { ...x, msgs, updated: msgs.length !== x.msgs.length ? Date.now() : x.updated, title: x.title || (msgs.find((m) => m.role === 'user')?.text ?? '').slice(0, 48) })), [])

  return (
    <main className="grid h-[calc(100vh-42px)] gap-3 p-3 lg:grid-cols-[250px_1fr] xl:grid-cols-[250px_1fr_300px]">
      <aside className="panel flex min-h-0 flex-col !p-2">
        <button onClick={newChat} className="mb-2 flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] transition-colors hover:border-blue"><Plus size={15} />{t('new_chat')}</button>
        <div className="lbl px-2 pb-1">{t('chats')}</div>
        <div className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {convs.filter((c) => c.msgs.length || c.id === active).sort((a, b) => b.updated - a.updated).map((c) => (
            <div key={c.id} className={`group flex items-center gap-2 rounded-md px-2 py-2 text-[13px] ${c.id === active ? 'bg-blue/10 text-text' : 'text-mute hover:bg-sunk hover:text-text'}`}>
              <button onClick={() => setActive(c.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><MessageSquare size={13} className="shrink-0" /><span className="truncate">{c.title || t('untitled')}</span></button>
              <button onClick={() => remove(c.id)} title={t('del_chat')} className="opacity-0 transition-opacity hover:text-bad group-hover:opacity-100"><Trash2 size={13} /></button>
            </div>))}
        </div>
      </aside>

      <section className="panel flex min-h-0 flex-col !p-0">
        <div className="flex h-[40px] items-center gap-2 border-b border-line bg-sunk px-3"><HardHat size={15} className="text-blue" />
          <span className="truncate text-[13px] font-semibold">{conv.title || t('chat_page')}</span>
          <span className="mono ml-auto hidden text-mute md:inline">{llmLabel(llm, t)}</span></div>
        <ChatPane key={conv.id} conv={conv} ctx={ctx} onSave={save} onLive={setLive} />
      </section>

      <div className="hidden min-h-0 space-y-3 overflow-y-auto xl:block"><PipelineRail log={log.data ?? []} issueDate={issueDate} live={live.steps} busy={live.busy} thinking={live.thinking} /><AnalogsPanel a={analogs.data} loading={analogs.loading} /></div>
    </main>
  )
}

function ChatPane({ conv, ctx, onSave, onLive }: { conv: Conv; ctx: Ctx; onSave: (id: string, m: Msg[]) => void; onLive: (l: { steps: Step[]; busy: boolean; thinking: boolean }) => void }) {
  const { d, lang } = useT()
  const chat = useAgentStream(d, lang, ctx.refresh, { issue_date: ctx.issueDate, turbine: ctx.turbine },
    { session: conv.session, msgs: conv.msgs }, (m) => onSave(conv.id, m))
  const last = chat.msgs[chat.msgs.length - 1]
  const steps = last?.role === 'agent' ? last.steps : []
  useEffect(() => { onLive({ steps, busy: chat.busy, thinking: chat.busy && chat.mode !== 'fast' }) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(steps), chat.busy, chat.mode])
  return <ChatView {...chat} />
}
