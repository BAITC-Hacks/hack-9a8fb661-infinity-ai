export const pct = (x: number | null | undefined, digits = 0) =>
  x == null || Number.isNaN(x) ? '–' : `${(x * 100).toFixed(digits)}%`

/** '2026-02-12T20:00:00Z' -> '12.02 20:00' (UTC) */
export const shortTime = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${iso.slice(11, 16)}`

export const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`

export const toLocal = (iso: string, offsetH = 5) => {
  const d = new Date(new Date(iso).getTime() + offsetH * 3600e3)
  return d.toISOString().slice(11, 16)
}
