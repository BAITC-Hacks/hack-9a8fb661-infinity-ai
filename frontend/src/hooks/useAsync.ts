import { useCallback, useEffect, useRef, useState } from 'react'

/** Загрузка данных с отменой устаревших ответов (быстрое переключение дат). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  const reload = useCallback(() => {
    const id = ++seq.current
    setLoading(true)
    fn()
      .then((d) => { if (id === seq.current) { setData(d); setError(null) } })
      .catch((e: Error) => { if (id === seq.current) setError(e.message) })
      .finally(() => { if (id === seq.current) setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { reload() }, [reload])
  return { data, error, loading, reload }
}
