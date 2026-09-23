import { useSyncExternalStore } from 'react'

export type Page = 'forecast' | 'replay' | 'map' | 'analytics' | 'agent'
const PAGES: Page[] = ['forecast', 'replay', 'map', 'analytics', 'agent']

const read = (): Page => {
  const h = location.hash.replace(/^#\/?/, '') as Page
  return PAGES.includes(h) ? h : 'forecast'
}
export const navigate = (p: Page) => { location.hash = `/${p}` }
export function usePage(): Page {
  return useSyncExternalStore((cb) => { addEventListener('hashchange', cb); return () => removeEventListener('hashchange', cb) }, read)
}
