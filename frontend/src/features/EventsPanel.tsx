import { AlertTriangle, ArrowDownRight, ArrowUpRight, Snowflake, Wind, Zap } from 'lucide-react'
import { useState } from 'react'
import type { AgentLogEntry, ForecastRow, Passport, WeatherPoint } from '../api/types'
import { hhmm } from '../lib/format'
import { useT } from '../lib/i18n'
import { PassportCard } from './PassportCard'

const TITLE: Record<string, string> = {
  fetch_forecast: 'Погода Open-Meteo', prepare_features: 'Подготовка данных', train_model: 'Обучение модели',
  predict: 'Прогноз', analyze: 'Анализ', evaluate: 'Оценка', replan: 'Перепланирование', report: 'Отчёт', error: 'Ошибка',
}

/** Правая колонка: События (журнал агента) / Выводы по прогнозу; внизу свёрнутый паспорт выпуска. */
export function EventsPanel({ rows, weather, log, rated, passport, llm }: { rows: ForecastRow[]; weather: WeatherPoint[]; log: AgentLogEntry[]; rated: number; passport: Passport | null; llm: string }) {
  const { t } = useT()
  const [tab, setTab] = useState<'events' | 'insights'>('insights')
  const p = rows.map((r) => r.p_hat)
  const iMax = p.length ? p.indexOf(Math.max(...p)) : -1, iMin = p.length ? p.indexOf(Math.min(...p)) : -1
  const winds = weather.map((w) => w.wind_speed_100m).filter((v): v is number => v != null)
  const temps = weather.map((w) => w.temperature_2m).filter((v): v is number => v != null)
  const gusts = weather.map((w) => w.wind_gusts_10m).filter((v): v is number => v != null)
  const ins: { icon: React.ReactNode; text: string; tone?: string }[] = []
  if (iMax >= 0) ins.push({ icon: <ArrowUpRight size={14} />, text: t('ins_peak', { mw: (p[iMax] * rated).toFixed(2), t: hhmm(rows[iMax].target_time) }) })
  if (iMin >= 0) ins.push({ icon: <ArrowDownRight size={14} />, text: t('ins_min', { mw: (p[iMin] * rated).toFixed(2), t: hhmm(rows[iMin].target_time) }) })
  const calm = p.filter((v) => v < 0.05).length
  if (calm) ins.push({ icon: <Wind size={14} />, text: t('ins_calm', { n: calm }), tone: 'text-warn' })
  if (winds.length > 6) {
    const a = winds.slice(0, 6).reduce((x, y) => x + y, 0) / 6, b = winds.slice(-6).reduce((x, y) => x + y, 0) / 6
    if (Math.abs(b - a) > 1.5) ins.push({ icon: <Wind size={14} />, text: t(b > a ? 'ins_trend_up' : 'ins_trend_down', { v: b.toFixed(1) }) })
  }
  if (temps.length && Math.min(...temps) < -10) ins.push({ icon: <Snowflake size={14} />, text: t('ins_frost', { t: Math.min(...temps).toFixed(0) }), tone: 'text-blue' })
  if (gusts.length && Math.max(...gusts) > 18) ins.push({ icon: <AlertTriangle size={14} />, text: t('ins_gust', { v: Math.max(...gusts).toFixed(0) }), tone: 'text-warn' })

  return (
    <aside className="panel !p-0 self-start">
      <div className="flex h-[44px] items-center gap-1 border-b border-line bg-sunk px-2">
        {(['events', 'insights'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1 text-[13px] transition-colors ${tab === k ? 'bg-panel text-text' : 'text-mute hover:text-text'}`}>{t(k)}</button>))}
        <span className="mono ml-auto flex items-center gap-1.5 text-mute"><i className="dot size-1.5 rounded-full bg-good" />{t('live')} · {llm.split(' ')[0]}</span>
      </div>
      <div className="scroll-thin max-h-[560px] overflow-y-auto p-2">
        {tab === 'insights' ? (
          <ul className="space-y-1">
            {ins.length ? ins.map((x, i) => (
              <li key={i} className={`pop flex items-start gap-2 rounded-md px-2 py-2 text-[13px] hover:bg-sunk ${x.tone ?? ''}`} style={{ animationDelay: `${i * 60}ms` }}><span className="mt-0.5 text-blue">{x.icon}</span>{x.text}</li>
            )) : <li className="px-2 py-4 text-[13px] text-mute">{t('ins_none')}</li>}
          </ul>
        ) : (
          <ul className="space-y-1">
            {log.length ? log.map((e, i) => (
              <li key={e.id} className="pop rounded-md border border-line/60 px-2.5 py-2" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex items-center gap-2 text-[13px]"><Zap size={13} className={e.reason ? 'text-warn' : 'text-blue'} /><span className="font-medium">{TITLE[e.tool] ?? e.tool}</span>
                  <span className="mono ml-auto text-mute">{e.ts.slice(11, 19)}</span></div>
                {e.reason && <div className="mt-1 text-[12px] text-warn">{e.reason}</div>}
                {!e.reason && e.result != null && <div className="mono mt-0.5 truncate text-mute">{JSON.stringify(e.result).slice(0, 120)}</div>}
              </li>
            )) : <li className="px-2 py-4 text-[13px] text-mute">{t('ins_none')}</li>}
          </ul>
        )}
        <details className="mt-2 border-t border-line pt-2">
          <summary className="lbl cursor-pointer px-2 py-1 hover:text-text">{t('passport')}</summary>
          <div className="mt-1"><PassportCard p={passport} error={null} /></div>
        </details>
      </div>
    </aside>
  )
}
