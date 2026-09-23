import { Download } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { TimelinePoint } from '../api/types'
import { pct, shortTime } from '../lib/format'

export function TestPeriodPanel({ points }: { points: TimelinePoint[] }) {
  const data = points.filter((p) => p.issue_date >= '2026-01-31').map((p) => ({ t: shortTime(p.target_time), p: p.p_hat, issue: p.issue_date }))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-mute">
        <span>Склейка всех выпусков 31.01–27.02: для каждого — первые 24 ч (то, что было бы отправлено диспетчеру).</span>
        <a href={api.exportCsvUrl} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-text transition hover:border-acc">
          <Download size={14} />forecasts.csv
        </a>
      </div>
      <div className="h-[340px]">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ left: -8, right: 8 }}>
            <defs>
              <linearGradient id="gFeb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#76b900" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#76b900" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1f2833" strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: '#8391a0', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1f2833' }} minTickGap={60} />
            <YAxis domain={[0, 1]} tickFormatter={(v) => pct(v)} tick={{ fill: '#8391a0', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: '#0e1217', border: '1px solid #1f2833', borderRadius: 12, fontSize: 12 }}
              formatter={(v) => pct(Number(v), 1)} labelFormatter={(l) => `${l} UTC`} />
            <Area dataKey="p" name="Прогноз" stroke="#76b900" strokeWidth={1.8} fill="url(#gFeb)" animationDuration={1400} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
