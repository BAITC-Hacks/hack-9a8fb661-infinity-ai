import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import clsx from 'clsx'

export function Card({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={clsx('glass p-5', className)}
    >
      {children}
    </motion.section>
  )
}

export function CardTitle({ icon, title, right }: { icon?: ReactNode; title: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-text">
        {icon && <span className="text-acc">{icon}</span>}
        {title}
      </h2>
      {right && <div className="text-xs text-mute">{right}</div>}
    </div>
  )
}
