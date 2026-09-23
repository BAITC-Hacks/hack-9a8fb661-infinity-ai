import type { TurbineId, WindObject } from '../api/types'

/** Общее состояние страниц: объект, дата выпуска, справочник, счётчик обновлений. */
export interface Ctx {
  turbine: TurbineId; setTurbine: (t: TurbineId) => void
  issueDate: string; setIssueDate: (d: string) => void
  tick: number; refresh: () => void
  objs: WindObject[]; ratedOf: (id: TurbineId) => number
  llm: string
}
