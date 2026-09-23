import { animate, useMotionValue, useTransform, motion } from 'motion/react'
import { useEffect } from 'react'

/** Число плавно «перетекает» к новому значению при смене выпуска/турбины. */
export function AnimatedNumber({ value, format }: { value: number | null; format: (v: number) => string }) {
  const mv = useMotionValue(value ?? 0)
  const text = useTransform(mv, (v) => (value == null ? '–' : format(v)))
  useEffect(() => {
    if (value == null) return
    const c = animate(mv, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1] })
    return () => c.stop()
  }, [value, mv])
  return <motion.span className="tabular">{text}</motion.span>
}
