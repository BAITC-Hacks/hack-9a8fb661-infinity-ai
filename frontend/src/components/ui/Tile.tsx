export type Tone = 'neutral' | 'good' | 'warn'

export function Tile({ label, value, unit, tone = 'neutral' }: { label: string; value: string; unit?: string; tone?: Tone }) {
  const color = tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : 'text-text'
  return (
    <div className="rounded-[10px] border border-line bg-panel p-3.5">
      <div className="text-[13px] text-mute">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`num text-[26px] font-semibold leading-tight ${color}`}>{value}</span>
        {unit && <span className="text-[13px] text-mute">{unit}</span>}
      </div>
    </div>
  )
}
