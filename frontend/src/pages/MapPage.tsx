import { api } from '../api/client'
import { SiteMap } from '../features/SiteMap'
import { useAsync } from '../hooks/useAsync'
import { kpis } from '../lib/calc'
import type { Ctx } from '../lib/ctx'

export function MapPage({ ctx }: { ctx: Ctx }) {
  const { issueDate, objs, ratedOf, tick } = ctx
  const forecast = useAsync(() => api.forecast(issueDate, 'STATION'), [issueDate, tick])
  const weather = useAsync(() => api.weather(issueDate), [issueDate])
  const rated = ratedOf('STATION')
  const k = kpis(forecast.data?.rows ?? [], rated)
  const wx = (weather.data ?? []).find((w) => w.time === k.peakTime) ?? null
  return (
    <main className="p-4">
      <SiteMap objects={objs} wind={wx?.wind_speed_100m ?? null} direction={wx?.wind_direction_100m ?? null} power={k.peakMw == null ? null : k.peakMw / rated} />
    </main>
  )
}
