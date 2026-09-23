import { HardHat, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAgentStream } from '../hooks/useAgentStream'
import { useT } from '../lib/i18n'
import { ChatView } from './ChatView'

/** Агент-инженер в правом нижнем углу. */
export function AgentWidget({ onChanged, context }: { onChanged: () => void; context?: { issue_date?: string; turbine?: string } }) {
  const [open, setOpen] = useState(false)
  useEffect(() => { const h = () => setOpen(true); window.addEventListener('open-agent', h); return () => window.removeEventListener('open-agent', h) }, [])
  const { t, d, lang } = useT()
  const chat = useAgentStream(d, lang, onChanged, context)
  return (
    <>
      <div className={`fixed right-5 bottom-24 z-40 flex h-[min(620px,calc(100vh-8rem))] w-[min(460px,calc(100vw-2.5rem))] origin-bottom-right flex-col rounded-[10px] border border-line bg-panel transition-all duration-300 ease-out ${open ? 'scale-100 opacity-100' : 'pointer-events-none translate-y-3 scale-95 opacity-0'}`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-blue/15 text-blue"><HardHat size={17} /></span>
            <div><div className="text-sm font-semibold">{t('agent')}</div><div className="text-xs text-mute">{chat.busy ? t('working') : t('online')}</div></div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="close" className="text-mute transition-colors hover:text-text"><X size={18} /></button>
        </div>
        <ChatView {...chat} compact />
      </div>
      <button onClick={() => setOpen((o) => !o)} aria-label={t('agent')}
        className={`fixed right-5 bottom-5 z-40 grid size-14 place-items-center rounded-full border bg-panel transition-all duration-200 hover:scale-105 ${open ? 'border-blue text-blue' : 'pulse border-blue/60 text-text'}`}>
        {open ? <X size={24} /> : <HardHat size={26} />}
      </button>
    </>
  )
}
