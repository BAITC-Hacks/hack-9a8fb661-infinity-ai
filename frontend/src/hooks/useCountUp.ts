import { useEffect, useRef, useState } from 'react'

/** Плавный пересчёт числа к новому значению (easeOutCubic). */
export function useCountUp(target: number | null, ms = 700) {
  const [v, setV] = useState(target ?? 0)
  const from = useRef(target ?? 0)
  useEffect(() => {
    if (target == null) return
    const start = performance.now(), a = from.current
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      const cur = a + (target - a) * (1 - (1 - k) ** 3)
      setV(cur)
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = target
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); from.current = target }
  }, [target, ms])
  return target == null ? null : v
}
