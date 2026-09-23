import { useCountUp } from '../../hooks/useCountUp'

export type Tone = 'neutral' | 'good' | 'warn'

interface Props {
  label: string
  value: number | null
  format: (v: number) => string
  unit?: string
  tone?: Tone
  delay?: number
}

export function Tile({ label, value, format, unit, tone = 'neutral', delay = 0 }: Props) {
  const v = useCountUp(value)
  const color = tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : 'text-text'
  return (
    <div className="rise lift rounded-[10px] border border-line bg-panel p-3.5" style={{ animationDelay: `${delay}ms` }}>
      <div className="text-[13px] text-mute">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`num text-[26px] font-semibold leading-tight ${color}`}>{v == null ? '—' : format(v)}</span>
        {unit && <span className="text-[13px] text-mute">{unit}</span>}
      </div>
    </div>
  )
}
