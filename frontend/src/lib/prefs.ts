import { useSyncExternalStore } from 'react'

export type Lang = 'ru' | 'kk'
export type Theme = 'dark' | 'light'

interface Prefs { lang: Lang; theme: Theme }

const KEY = 'infinity-prefs'
let prefs: Prefs = { lang: 'ru', theme: 'dark' }
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? '')
  if (saved.lang === 'kk' || saved.lang === 'ru') prefs.lang = saved.lang
  if (saved.theme === 'light' || saved.theme === 'dark') prefs.theme = saved.theme
} catch { /* хранилище недоступно — значения по умолчанию */ }

const listeners = new Set<() => void>()
const apply = () => {
  document.documentElement.dataset.theme = prefs.theme
  document.documentElement.lang = prefs.lang
}
apply()

export function setPrefs(p: Partial<Prefs>) {
  prefs = { ...prefs, ...p }
  try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
  apply()
  listeners.forEach((l) => l())
}

export function usePrefs(): Prefs {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => prefs)
}
