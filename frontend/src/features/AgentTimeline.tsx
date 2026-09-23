import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, BarChart3, Brain, CloudDownload, FileText, Microscope, RefreshCcw, Sparkles, Wrench } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AgentLogEntry } from '../api/types'

const ICON: Record<string, ReactNode> = {
  fetch_forecast: <CloudDownload size={15} />, prepare_features: <Wrench size={15} />,
  train_model: <Brain size={15} />, predict: <Sparkles size={15} />, analyze: <Microscope size={15} />,
  evaluate: <BarChart3 size={15} />, replan: <RefreshCcw size={15} />, report: <FileText size={15} />,
  error: <AlertTriangle size={15} />,
}
const TITLE: Record<string, string> = {
  fetch_forecast: 'Получение архивного прогноза погоды', prepare_features: 'Подготовка признаков',
  train_model: 'Обучение модели', predict: 'Почасовой прогноз', analyze: 'Анализ результата',
  evaluate: 'Оценка против факта', replan: 'Перепланирование', report: 'Отчёт LLM', error: 'Ошибка',
}

export function AgentTimeline({ entries }: { entries: AgentLogEntry[] }) {
  if (!entries.length) return <p className="text-sm text-mute">Журнал пуст — запустите агента.</p>
  return (
    <ol className="relative space-y-1 before:absolute before:left-[17px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-gradient-to-b before:from-acc/60 before:to-line">
      <AnimatePresence initial>
        {entries.map((e, i) => {
          const alert = e.tool === 'replan' || e.tool === 'error' || !!e.reason
          return (
            <motion.li key={e.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35 }} className="relative flex gap-3 rounded-xl p-2 hover:bg-panel-2/60">
              <span className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-full border ${alert ? 'border-warn/50 bg-warn/10 text-warn' : 'border-acc/40 bg-bg text-acc'}`}>
                {ICON[e.tool] ?? <Sparkles size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{TITLE[e.tool] ?? e.tool}</span>
                  <code className="font-mono text-[11px] text-sky">{e.tool}</code>
                  <span className="ml-auto font-mono text-[11px] text-mute">{e.ts.slice(11, 19)}</span>
                </div>
                {e.reason && <div className="mt-0.5 text-sm text-warn">→ {e.reason}</div>}
                <Result tool={e.tool} result={e.result} />
              </div>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ol>
  )
}

function Result({ tool, result }: { tool: string; result: unknown }) {
  if (result == null) return null
  if (tool === 'report' && typeof result === 'object' && result && 'text' in result)
    return <p className="mt-1 text-sm leading-relaxed text-text/90">{String((result as { text: string }).text)}</p>
  const s = JSON.stringify(result)
  return <code className="mt-1 block truncate font-mono text-[11px] text-mute" title={s}>{s}</code>
}
