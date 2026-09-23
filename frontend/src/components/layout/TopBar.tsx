import { ChevronLeft, LogOut, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../../lib/i18n'
import { setPrefs, usePrefs } from '../../lib/prefs'

/** Шапка 42px: назад · заголовок раздела · контекст объёма · язык · тема · часы. */
export function TopBar({ ctx, user, onLogout }: { ctx: string; user: string; onLogout: () => void }) {
  const { t } = useT()
  const { lang, theme } = usePrefs()
  const [now, setNow] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  const clock = now.toLocaleTimeString('ru-RU', { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return (
    <header className="flex h-[42px] items-center gap-3 border-b border-line bg-panel px-4">
      <a href="#" className="flex items-center gap-1 text-[13px] text-blue hover:underline"><ChevronLeft size={14} />{t('app')}</a>
      <span className="h-5 w-px bg-line" />
      <span className="text-[14px] font-semibold">{t('section')}</span>
      <span className="mono ml-auto text-mute">{ctx}</span>
      <span className="mono num flex items-center gap-1.5 text-mute"><i className="dot size-1.5 rounded-full bg-good" />{t('almaty')} {clock}</span>
      <div className="seg !h-7">
        {(['ru', 'kk'] as const).map((l) => (
          <button key={l} className={lang === l ? 'on' : ''} onClick={() => setPrefs({ lang: l })}>{l === 'ru' ? 'Рус' : 'Қаз'}</button>
        ))}
      </div>
      <button onClick={() => setPrefs({ theme: theme === 'dark' ? 'light' : 'dark' })} aria-label={theme === 'dark' ? t('theme_light') : t('theme_dark')}
        className="grid size-7 place-items-center rounded-lg border border-line text-mute transition-all hover:rotate-12 hover:border-blue hover:text-text">
        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
      </button>
      {user !== 'local' && <button onClick={onLogout} title={t('logout')} className="flex h-7 items-center gap-1.5 rounded-lg border border-line px-2 text-[12px] text-mute hover:border-blue hover:text-text"><LogOut size={13} />{user}</button>}
    </header>
  )
}
