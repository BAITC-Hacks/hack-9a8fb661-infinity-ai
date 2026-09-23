import { Loader2, Lock } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import { useT } from '../lib/i18n'
import { setPrefs, usePrefs } from '../lib/prefs'

export function LoginPage({ onLogin }: { onLogin: (user: string) => void }) {
  const { t } = useT()
  const { lang } = usePrefs()
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try { const r = await api.login(u.trim(), p); onLogin(r.user) }
    catch (x) { setErr((x as Error).message || t('login_err')); setP('') }
    finally { setBusy(false) }
  }
  return (
    <div className="grid min-h-full place-items-center p-4">
      <form onSubmit={submit} className="panel pop w-full max-w-sm space-y-4 !p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-blue/15 text-blue"><Lock size={18} /></span>
          <div><div className="text-[16px] font-semibold">{t('login_title')}</div><div className="mono text-mute">Infinity AI · {t('section')}</div></div>
          <div className="seg ml-auto !h-7">{(['ru', 'kk'] as const).map((l) => <button type="button" key={l} className={lang === l ? 'on' : ''} onClick={() => setPrefs({ lang: l })}>{l === 'ru' ? 'Рус' : 'Қаз'}</button>)}</div>
        </div>
        <label className="block space-y-1"><span className="lbl">{t('login_user')}</span>
          <input autoFocus autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} maxLength={64} className="field w-full py-2 text-[15px]" /></label>
        <label className="block space-y-1"><span className="lbl">{t('login_pass')}</span>
          <input type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} maxLength={128} className="field w-full py-2 text-[15px]" /></label>
        {err && <p className="text-[13px] text-bad">{err}</p>}
        <button disabled={busy || !u || !p} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue py-2.5 font-semibold text-ink disabled:opacity-50">
          {busy && <Loader2 size={16} className="animate-spin" />}{t('login_btn')}</button>
      </form>
    </div>
  )
}
