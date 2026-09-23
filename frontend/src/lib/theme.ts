import { usePrefs } from './prefs'

export interface Palette {
  bg: string; panel: string; line: string; text: string; mute: string
  blue: string; good: string; warn: string; bad: string; curve: string; base: string; data: string; sunk: string
}

export const DARK: Palette = {
  bg: '#0d1117', panel: '#161b22', line: '#30363d', text: '#e6edf3', mute: '#8b949e',
  blue: '#58a6ff', good: '#3fb950', warn: '#f0883e', bad: '#f85149', curve: '#a371f7', base: '#30363d', data: '#e3b341', sunk: '#0b0f14',
}
export const LIGHT: Palette = {
  bg: '#f6f8fa', panel: '#ffffff', line: '#d0d7de', text: '#1f2328', mute: '#59636e',
  blue: '#0969da', good: '#1a7f37', warn: '#bc4c00', bad: '#cf222e', curve: '#8250df', base: '#c8d1da', data: '#9a6700', sunk: '#eef1f4',
}

export function usePalette(): Palette {
  return usePrefs().theme === 'light' ? LIGHT : DARK
}
