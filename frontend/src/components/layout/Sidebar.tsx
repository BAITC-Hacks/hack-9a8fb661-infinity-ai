import { Cpu, Database, CloudSun, Loader2, RefreshCw, Wind } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Health, TurbineId } from '../../api/types'

const OBJECTS: { id: TurbineId; label: string }[] = [
  { id: 'STATION', label: 'Станция' }, { id: 'T1', label: 'Турбина 1' }, { id: 'T2', label: 'Турбина 2' },
]

interface Props {
  turbine: TurbineId
  onTurbine: (t: TurbineId) => void
  onRun: () => void
  running: boolean
  runMsg: string | null
  health: Health | null
}

/** Свёрнутая полоса 56px; при наведении раскрывается поверх контента. */
export function Sidebar(p: Props) {
  return (
    <aside className="group fixed inset-y-0 left-0 z-30 flex w-14 flex-col overflow-hidden border-r border-line bg-panel transition-[width] duration-200 hover:w-60">
      <div className="flex h-14 items-center gap-3 border-b border-line px-4">
        <span className="num text-lg font-bold text-blue">∞</span>
        <span className="whitespace-nowrap text-sm font-semibold opacity-0 group-hover:opacity-100">Infinity AI</span>
      </div>

      <nav className="flex flex-col gap-1 p-2">
        {OBJECTS.map((o) => (
          <Item key={o.id} active={p.turbine === o.id} onClick={() => p.onTurbine(o.id)}
            icon={<Wind size={18} />} label={o.label} badge={o.id === 'STATION' ? 'Σ' : o.id} />
        ))}
      </nav>

      <div className="border-t border-line p-2">
        <Item onClick={p.onRun} disabled={p.running} label={p.running ? 'Считаю…' : 'Пересчитать выпуск'}
          icon={p.running ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />} />
        {p.runMsg && <p className="whitespace-nowrap px-3 pt-1 text-[13px] text-mute opacity-0 group-hover:opacity-100">{p.runMsg}</p>}
      </div>

      <div className="mt-auto space-y-3 border-t border-line p-4 text-[13px] text-mute">
        <Sys icon={<Database size={16} />} v={p.health?.storage ?? '…'} />
        <Sys icon={<Cpu size={16} />} v={p.health?.llm ?? '…'} />
        <Sys icon={<CloudSun size={16} />} v="Open-Meteo" />
      </div>
    </aside>
  )
}

function Item({ icon, label, badge, active, onClick, disabled }: {
  icon: ReactNode; label: string; badge?: string; active?: boolean; onClick: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={label}
      className={`flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm ${active ? 'bg-bg text-blue' : 'text-mute hover:text-text'} disabled:opacity-50`}>
      <span className="relative shrink-0">{icon}
        {badge && <span className="num absolute -right-2 -bottom-1.5 text-[9px] font-bold">{badge}</span>}
      </span>
      <span className="whitespace-nowrap opacity-0 group-hover:opacity-100">{label}</span>
    </button>
  )
}

function Sys({ icon, v }: { icon: ReactNode; v: string }) {
  return (
    <div className="flex items-center gap-3" title={v}>
      <span className="shrink-0">{icon}</span>
      <span className="truncate font-mono text-text opacity-0 group-hover:opacity-100">{v}</span>
    </div>
  )
}
