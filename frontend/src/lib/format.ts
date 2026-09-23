export const pct = (x: number | null | undefined, digits = 0) =>
  x == null || Number.isNaN(x) ? '—' : `${(x * 100).toFixed(digits)}%`

const LOCAL_OFFSET_H = 5 // Алматы, UTC+5

/** ISO UTC -> Date в поясе Алматы (через UTC-геттеры) */
export const localDate = (iso: string) => new Date(new Date(iso).getTime() + LOCAL_OFFSET_H * 3600e3)
export const localHour = (iso: string) => localDate(iso).getUTCHours()
export const hhmm = (iso: string) => `${String(localHour(iso)).padStart(2, '0')}:00`
export const ddmm = (iso: string) => {
  const d = localDate(iso)
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
export const dayOf = (isoDate: string) => String(Number(isoDate.slice(8, 10)))
export const ruDate = (isoDate: string) => `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}`
