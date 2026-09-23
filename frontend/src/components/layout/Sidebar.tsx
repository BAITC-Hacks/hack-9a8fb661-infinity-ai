import { Bot, LineChart, Loader2, Map, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useT } from '../../lib/i18n'

interface Props { onRun: () => void; running: boolean; runMsg: string | null; onAgent: () => void }

/** Навигация по странице: свёрнута до 56px, раскрывается при наведении. */
export function Sidebar(p: Props) {
  const { t } = useT()
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <aside className="group fixed inset-y-0 left-0 z-30 flex w-14 flex-col overflow-hidden border-r border-line bg-panel transition-[width,background-color] duration-200 hover:w-56">
      <div className="flex h-[42px] items-center gap-3 border-b border-line px-4">
        <span className="num text-lg font-bold text-blue">∞</span>
        <span className="whitespace-nowrap text-sm font-semibold opacity-0 transition-opacity group-hover:opacity-100">Infinity AI</span>
      </div>
      <nav className="flex flex-col gap-1 p-2">
        <Item icon={<LineChart size={18} />} label={t('nav_forecast')} onClick={() => go('forecast')} active />
        <Item icon={<Map size={18} />} label={t('nav_map')} onClick={() => go('map')} />
        <Item icon={<Bot size={18} />} label={t('nav_agent')} onClick={p.onAgent} />
      </nav>
      <div className="mt-auto border-t border-line p-2">
        <Item onClick={p.onRun} disabled={p.running} label={p.running ? t('calc') : t('rerun')}
          icon={p.running ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />} />
        {p.runMsg && <p className="whitespace-nowrap px-3 pt-1 text-[12px] text-mute opacity-0 transition-opacity group-hover:opacity-100">{p.runMsg}</p>}
      </div>
    </aside>
  )
}

function Item({ icon, label, active, onClick, disabled }: { icon: ReactNode; label: string; active?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label}
      className={`flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors duration-200 ${active ? 'text-blue' : 'text-mute hover:text-text'} disabled:opacity-50`}>
      <span className="shrink-0">{icon}</span>
      <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">{label}</span>
    </button>
  )
}
