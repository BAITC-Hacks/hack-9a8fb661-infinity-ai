import type { ReactNode } from 'react'

/** Заголовок слева, управление этой панели — справа в той же строке. */
export function Panel({ title, controls, children, className = '', delay = 0 }: {
  title: string; controls?: ReactNode; children: ReactNode; className?: string; delay?: number
}) {
  return (
    <section className={`panel rise ${className}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
      </div>
      {children}
    </section>
  )
}

export function Problem({ children }: { children: ReactNode }) {
  return <p className="py-6 text-sm text-warn">{children}</p>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-sm text-mute">{children}</p>
}
