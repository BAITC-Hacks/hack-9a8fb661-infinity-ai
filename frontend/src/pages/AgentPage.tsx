import { HardHat, Zap } from 'lucide-react'
import { ChatView } from '../features/ChatView'
import { api } from '../api/client'
import { useAgentStream } from '../hooks/useAgentStream'
import { useAsync } from '../hooks/useAsync'
import type { Ctx } from '../lib/ctx'
import { useT } from '../lib/i18n'

const TITLE: Record<string, string> = {
  fetch_forecast: 'Прогноз погоды', prepare_features: 'Подготовка данных', train_model: 'Обучение модели',
  predict: 'Прогноз', analyze: 'Анализ результата', evaluate: 'Оценка', replan: 'Перепланирование', report: 'Отчёт LLM', error: 'Ошибка',
}

/** Страница агента: слева цикл агента для выбранного выпуска, справа полноэкранный диалог. */
export function AgentPage({ ctx }: { ctx: Ctx }) {
  const { t, d, lang } = useT()
  const { issueDate, tick, refresh, llm, turbine } = ctx
  const log = useAsync(() => api.log(issueDate), [issueDate, tick])
  const chat = useAgentStream(d, lang, refresh, { issue_date: issueDate, turbine })
  return (
    <main className="grid gap-4 p-4 xl:grid-cols-[420px_1fr]">
      <section className="panel !p-0">
        <div className="flex h-[44px] items-center gap-2 border-b border-line bg-sunk px-3"><span className="text-[14px] font-semibold">{t('pipeline')}</span><span className="mono ml-auto text-mute">{issueDate}</span></div>
        <ol className="scroll-thin max-h-[640px] space-y-1 overflow-y-auto p-2">
          {(log.data ?? []).map((e, i) => (
            <li key={e.id} className="pop rounded-md border border-line/60 px-2.5 py-2" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-center gap-2 text-[13px]"><Zap size={13} className={e.reason ? 'text-warn' : 'text-blue'} /><span className="font-medium">{TITLE[e.tool] ?? e.tool}</span><span className="mono ml-auto text-mute">{e.ts.slice(11, 19)}</span></div>
              {e.reason && <div className="mt-1 text-[12px] text-warn">{e.reason}</div>}
              {e.tool === 'report' && e.result != null && <p className="mt-1 text-[13px] leading-relaxed">{String((e.result as { text?: string }).text ?? '').replace(/\[mock\]\s*/g, '')}</p>}
              {e.tool !== 'report' && e.result != null && <div className="mono mt-0.5 truncate text-mute">{JSON.stringify(e.result).slice(0, 140)}</div>}
            </li>))}
        </ol>
      </section>
      <section className="panel flex h-[calc(100vh-110px)] min-h-[520px] flex-col !p-0">
        <div className="flex h-[44px] items-center gap-2 border-b border-line bg-sunk px-3"><HardHat size={16} className="text-blue" /><span className="text-[14px] font-semibold">{t('chat_page')}</span>
          <span className="mono ml-auto text-mute">{chat.busy ? t('working') : t('online')} · {llm.replace('rules', 'правила')}</span></div>
        <ChatView {...chat} />
      </section>
    </main>
  )
}
