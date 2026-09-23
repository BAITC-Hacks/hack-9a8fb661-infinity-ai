import { ShieldAlert, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import type { RunStatus } from '../../api/types'

export function StatusBadge({ status, mode }: { status: RunStatus; mode: 'backtest' | 'forecast' }) {
  const ok = status === 'ok'
  return (
    <div className="flex items-center gap-2">
      <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
        ok ? 'border-acc/40 bg-acc/10 text-acc-soft' : 'border-warn/40 bg-warn/10 text-warn')}>
        {ok ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
        {ok ? 'Достоверность обычная' : 'Пониженная достоверность'}
      </span>
      <span className="rounded-full border border-line px-3 py-1 text-xs text-mute">
        {mode === 'backtest' ? 'Бэктест · есть факт' : 'Тестовый период · без факта'}
      </span>
    </div>
  )
}
