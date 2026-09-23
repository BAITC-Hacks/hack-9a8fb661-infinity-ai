import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Cpu, Database, CloudSun, Loader2, Play, Zap } from 'lucide-react'
import type { Health, Run, TurbineId } from '../../api/types'
import { Segmented } from '../ui/Segmented'

interface Props {
  issues: Run[]
  issueDate: string
  onIssue: (d: string) => void
  turbine: TurbineId
  onTurbine: (t: TurbineId) => void
  horizon: 24 | 48
  onHorizon: (h: 24 | 48) => void
  onRun: () => void
  running: boolean
  runMsg: string | null
  health: Health | null
}

export function Sidebar(p: Props) {
  const idx = p.issues.findIndex((r) => r.issue_date === p.issueDate)
  const step = (d: number) => {
    const n = p.issues[idx + d]
    if (n) p.onIssue(n.issue_date)
  }
  return (
    <aside className="flex flex-col gap-6 border-b border-line bg-panel/70 p-5 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-r lg:border-b-0">
      <div className="flex items-center gap-3">
        <motion.div
          className="grid size-10 place-items-center rounded-xl bg-acc text-bg shadow-[0_0_30px_rgba(118,185,0,.45)]"
          animate={{ rotate: [0, 8, -8, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Zap size={20} strokeWidth={2.5} />
        </motion.div>
        <div>
          <div className="font-semibold tracking-tight">Infinity AI</div>
          <div className="text-xs text-mute">Agentic-прогноз выработки ВЭС</div>
        </div>
      </div>

      <Field label="Объект">
        <Segmented id="turbine" value={p.turbine} onChange={p.onTurbine}
          options={[{ value: 'STATION', label: 'Станция' }, { value: 'T1', label: 'T1' }, { value: 'T2', label: 'T2' }]} />
      </Field>

      <Field label="Дата выпуска прогноза" hint="00:00 UTC · 05:00 Алматы · горизонт +1…+48 ч">
        <div className="flex items-center gap-2">
          <IconBtn onClick={() => step(-1)} disabled={idx <= 0} label="Предыдущий выпуск"><ChevronLeft size={16} /></IconBtn>
          <select value={p.issueDate} onChange={(e) => p.onIssue(e.target.value)}
            className="tabular w-full rounded-xl border border-line bg-bg/60 px-3 py-2 text-sm outline-none focus:border-acc">
            {p.issues.map((r) => (
              <option key={r.issue_date} value={r.issue_date}>
                {r.issue_date}{r.mode === 'backtest' ? ' · бэктест' : ''}
              </option>
            ))}
          </select>
          <IconBtn onClick={() => step(1)} disabled={idx < 0 || idx >= p.issues.length - 1} label="Следующий выпуск"><ChevronRight size={16} /></IconBtn>
        </div>
      </Field>

      <Field label="Горизонт">
        <Segmented id="horizon" value={p.horizon} onChange={p.onHorizon}
          options={[{ value: 24, label: '24 ч' }, { value: 48, label: '48 ч' }]} />
      </Field>

      <div>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={p.onRun} disabled={p.running}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-acc px-4 py-3 font-semibold text-bg shadow-[0_8px_30px_rgba(118,185,0,.35)] transition disabled:opacity-60">
          {p.running ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
          {p.running ? 'Агент считает…' : 'Запустить агента'}
        </motion.button>
        {p.runMsg && <p className="mt-2 text-xs text-mute">{p.runMsg}</p>}
      </div>

      <div className="mt-auto space-y-2 border-t border-line pt-4 text-xs text-mute">
        <SysRow icon={<Database size={14} />} k="Хранилище" v={p.health?.storage ?? '…'} />
        <SysRow icon={<Cpu size={14} />} k="LLM" v={p.health?.llm ?? '…'} />
        <SysRow icon={<CloudSun size={14} />} k="Погода" v={p.health ? `Open-Meteo${p.health.weather_offline ? ' · кеш' : ''}` : '…'} />
      </div>
    </aside>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wider text-mute">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-mute/80">{hint}</div>}
    </div>
  )
}

function IconBtn({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button aria-label={label} onClick={onClick} disabled={disabled}
      className="grid size-9 shrink-0 place-items-center rounded-xl border border-line text-mute transition hover:border-acc hover:text-acc disabled:opacity-30">
      {children}
    </button>
  )
}

function SysRow({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-acc">{icon}</span>
      <span>{k}</span>
      <span className="ml-auto truncate font-mono text-text" title={v}>{v}</span>
    </div>
  )
}
