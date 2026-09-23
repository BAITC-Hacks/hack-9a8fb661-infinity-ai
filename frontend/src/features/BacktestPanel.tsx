import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MetricsResponse } from '../api/types'
import { pct, shortDate } from '../lib/format'

export function BacktestPanel({ m }: { m: MetricsResponse }) {
  const days = m.station_by_issue_date.map((d) => ({ d: shortDate(d.issue_date ?? ''), model: d.mae, base: d.mae_base }))
  return (
    <div className="space-y-5">
      <div className="overflow-x-auto">
        <table className="tabular w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-mute">
            <tr>{['Объект', 'Горизонт', 'N', 'MAE', 'RMSE', 'MAE персист.', 'Skill'].map((h, i) =>
              <th key={h} className={`border-b border-line py-2 font-medium ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {m.by_turbine_and_horizon.map((r) => (
              <tr key={`${r.turbine}${r.bucket}`} className="border-b border-line/60 hover:bg-panel-2/60">
                <td className="py-2">{r.turbine}</td><td>{r.bucket}</td>
                <td className="text-right">{r.n}</td>
                <td className="text-right">{r.mae.toFixed(3)}</td>
                <td className="text-right">{r.rmse.toFixed(3)}</td>
                <td className="text-right text-mute">{r.mae_base?.toFixed(3) ?? '–'}</td>
                <td className="text-right">
                  <span className="rounded-full bg-acc/15 px-2 py-0.5 font-semibold text-acc-soft">{pct(r.skill)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="h-64">
        <ResponsiveContainer>
          <BarChart data={days} margin={{ left: -16, right: 8 }}>
            <CartesianGrid stroke="#1f2833" strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="d" tick={{ fill: '#8391a0', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1f2833' }} />
            <YAxis tick={{ fill: '#8391a0', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: 'rgba(118,185,0,.06)' }} contentStyle={{ background: '#0e1217', border: '1px solid #1f2833', borderRadius: 12, fontSize: 12 }}
              formatter={(v) => Number(v).toFixed(3)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="model" name="MAE модели" fill="#76b900" radius={[4, 4, 0, 0]} animationDuration={900} />
            <Bar dataKey="base" name="MAE персистентности" fill="#334155" radius={[4, 4, 0, 0]} animationDuration={900} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {m.note && <p className="text-xs text-mute">{m.note}</p>}
    </div>
  )
}
