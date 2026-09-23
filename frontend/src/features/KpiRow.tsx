import { motion } from 'motion/react'
import { Activity, BatteryCharging, Gauge, Target } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ForecastRow } from '../api/types'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { pct, shortTime } from '../lib/format'

export function KpiRow({ rows }: { rows: ForecastRow[] }) {
  const p = rows.map((r) => r.p_hat)
  const energy = p.reduce((a, b) => a + b, 0)
  const iMax = p.length ? p.indexOf(Math.max(...p)) : -1
  const fact = rows.filter((r) => r.actual != null)
  const mae = fact.length ? fact.reduce((a, r) => a + Math.abs(r.actual! - r.p_hat), 0) / fact.length : null
  const base = fact.filter((r) => r.baseline != null)
  const maeB = base.length ? base.reduce((a, r) => a + Math.abs(r.actual! - r.baseline!), 0) / base.length : null
  const skill = mae != null && maeB ? 1 - mae / maeB : null

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <Kpi i={0} icon={<BatteryCharging size={18} />} label="Энергия за горизонт"
        value={<AnimatedNumber value={p.length ? energy : null} format={(v) => v.toFixed(1)} />} unit="ч × Pном" />
      <Kpi i={1} icon={<Gauge size={18} />} label="Средняя мощность"
        value={<AnimatedNumber value={p.length ? energy / p.length : null} format={(v) => pct(v)} />} unit="от номинала" />
      <Kpi i={2} icon={<Activity size={18} />} label="Пик"
        value={<AnimatedNumber value={iMax >= 0 ? p[iMax] : null} format={(v) => pct(v)} />}
        unit={iMax >= 0 ? `${shortTime(rows[iMax].target_time)} UTC` : ''} />
      <Kpi i={3} icon={<Target size={18} />} label="MAE выпуска"
        value={<AnimatedNumber value={mae} format={(v) => v.toFixed(3)} />}
        unit={skill != null ? `на ${pct(skill)} точнее персистентности` : 'факт за период не предоставлен'}
        accent={skill != null && skill > 0} />
    </div>
  )
}

function Kpi({ i, icon, label, value, unit, accent }: { i: number; icon: ReactNode; label: string; value: ReactNode; unit: string; accent?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className="glass group relative overflow-hidden p-4"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-acc/10 blur-2xl transition group-hover:bg-acc/20" />
      <div className="flex items-center gap-2 text-xs text-mute"><span className="text-acc">{icon}</span>{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      <div className={`mt-1 text-xs ${accent ? 'text-acc-soft' : 'text-mute'}`}>{unit}</div>
    </motion.div>
  )
}
