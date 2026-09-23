import { BarChart3, Bot, CalendarClock, LineChart, Loader2, Map, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useT } from '../../lib/i18n'
import { navigate, usePage, type Page } from '../../lib/router'

interface Props { onRun: () => void; running: boolean; runMsg: string | null }

/** Навигация по страницам: свёрнута до 56px, раскрывается при наведении. */
export function Sidebar(p: Props) {
  const { t } = useT()
  const page = usePage()
  const items: { id: Page; icon: ReactNode; label: string }[] = [
    { id: 'forecast', icon: <LineChart size={18} />, label: t('nav_forecast') },
    { id: 'replay', icon: <CalendarClock size={18} />, label: t('nav_replay') },
    { id: 'map', icon: <Map size={18} />, label: t('nav_map') },
    { id: 'analytics', icon: <BarChart3 size={18} />, label: t('nav_analytics') },
    { id: 'agent', icon: <Bot size={18} />, label: t('nav_agent') },
  ]
  return (
    <aside className="group fixed inset-y-0 left-0 z-30 flex w-14 flex-col overflow-hidden border-r border-line bg-panel transition-[width,background-color] duration-200 hover:w-56">
      <div className="flex h-[64px] items-center gap-3 border-b border-line px-2.5">
        <TurbineLogo />
        <span className="flex flex-col whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">
          <span className="text-[15px] font-semibold leading-tight">Нурлы</span>
          <span className="text-[11px] text-mute">Infinity AI · прогноз</span>
        </span>
      </div>
      <nav className="flex flex-col gap-1 p-2">
        {items.map((it) => <Item key={it.id} icon={it.icon} label={it.label} active={page === it.id} onClick={() => navigate(it.id)} />)}
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
      className={`flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors duration-200 ${active ? 'bg-blue/10 text-blue' : 'text-mute hover:text-text'} disabled:opacity-50`}>
      <span className="shrink-0">{icon}</span>
      <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">{label}</span>
    </button>
  )
}

/** Логотип: ветротурбина с вращающимся ротором. */
function TurbineLogo() {
  return (
    <svg viewBox="0 0 36 44" className="h-10 w-9 shrink-0 text-blue" aria-hidden>
      <path d="M17 16 L16 43 L20 43 L19 16 Z" fill="currentColor" opacity=".85" />
      <rect x="15" y="12" width="7" height="4" rx="1.5" fill="currentColor" />
      <g className="logo-rotor" style={{ transformOrigin: '18px 14px' }}>
        <path d="M18 14 C17 9 17.2 4 18 1 C18.8 4 19 9 18 14 Z" fill="currentColor" />
        <path d="M18 14 C22.3 16.5 26.5 19.2 28.9 21.2 C26 20.3 21.7 17.9 18 14 Z" fill="currentColor" />
        <path d="M18 14 C13.7 16.5 9.5 19.2 7.1 21.2 C10 20.3 14.3 17.9 18 14 Z" fill="currentColor" />
        <circle cx="18" cy="14" r="2" fill="var(--color-panel)" stroke="currentColor" strokeWidth="1.2" />
      </g>
    </svg>
  )
}
