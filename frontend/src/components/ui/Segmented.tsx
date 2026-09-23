interface Props<T extends string | number> {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}

/** Тумблер: кнопки в одной рамке без промежутка, активная залита синим. */
export function Segmented<T extends string | number>({ value, options, onChange }: Props<T>) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-line">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${o.value === value ? 'bg-blue text-ink' : 'text-mute hover:text-text'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
