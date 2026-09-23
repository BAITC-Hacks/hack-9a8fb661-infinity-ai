import { motion } from 'motion/react'
import clsx from 'clsx'

interface Props<T extends string | number> {
  id: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}

export function Segmented<T extends string | number>({ id, value, options, onChange }: Props<T>) {
  return (
    <div className="relative flex rounded-xl border border-line bg-bg/60 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx('relative z-10 flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            o.value === value ? 'text-bg' : 'text-mute hover:text-text')}
        >
          {o.value === value && (
            <motion.span layoutId={`seg-${id}`} className="absolute inset-0 -z-10 rounded-lg bg-acc shadow-[0_0_20px_rgba(118,185,0,.35)]"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
          )}
          {o.label}
        </button>
      ))}
    </div>
  )
}
