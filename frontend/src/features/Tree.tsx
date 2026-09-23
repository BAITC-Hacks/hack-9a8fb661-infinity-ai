import { ChevronDown, Wind, Zap } from 'lucide-react'
import type { TurbineId, WindObject } from '../api/types'
import { useT } from '../lib/i18n'

/** Дерево: генерация ВИЭ → ВЭС → турбины. Выбранный узел подсвечен. */
export function Tree({ objects, turbine, onTurbine }: { objects: WindObject[]; turbine: TurbineId; onTurbine: (t: TurbineId) => void }) {
  const { t } = useT()
  const node = (id: TurbineId, label: string, depth: number, icon: React.ReactNode) => (
    <button key={id} onClick={() => onTurbine(id)}
      className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors ${turbine === id ? 'bg-blue/15 text-blue' : 'text-text hover:bg-sunk'}`}
      style={{ paddingLeft: 8 + depth * 16 }}>
      {icon}<span className="truncate">{label}</span>
    </button>
  )
  return (
    <aside className="panel !p-2">
      <div className="lbl px-2 pb-2 pt-1">{t('tree')}</div>
      <div className="flex items-center gap-2 px-2 py-1.5 text-[13px] text-mute"><ChevronDown size={14} />{t('root')}</div>
      {node('STATION', t('station'), 1, <Zap size={14} />)}
      {(objects.length ? objects : [{ object_id: 1 }, { object_id: 2 }]).map((o) =>
        node(o.object_id === 1 ? 'T1' : 'T2', o.object_id === 1 ? t('t1') : t('t2'), 2, <Wind size={14} />))}
    </aside>
  )
}
