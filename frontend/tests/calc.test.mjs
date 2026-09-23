import assert from 'node:assert/strict'
import test from 'node:test'
import { completedForecast, forecastChecks, kpis } from '../src/lib/calc.ts'

const issue = '2026-02-10'
const rows = (n = 48) => Array.from({ length: n }, (_, i) => ({
  issue_date: issue, lead_hours: i + 1, turbine: 'T1', p_hat: 0.5, actual: null,
  target_time: new Date(Date.parse(`${issue}T00:00:00Z`) + (i + 1) * 3600e3).toISOString(),
}))

test('selected horizon requires every unique hour of the selected issue', () => {
  assert.equal(forecastChecks(rows(), 48, issue).ok, true)
  assert.equal(forecastChecks(rows(24), 24, issue).ok, true)
  assert.equal(forecastChecks(rows(24), 48, issue).ok, false)
  const duplicate = rows(); duplicate[47] = duplicate[46]
  assert.equal(forecastChecks(duplicate, 48, issue).ok, false)
  const shifted = rows(); shifted[4].target_time = shifted[5].target_time
  assert.equal(forecastChecks(shifted, 48, issue).ok, false)
  assert.equal(forecastChecks(rows(), 48, '2026-02-11').ok, false)
  for (const value of [null, NaN, Infinity, -0.1, 1.1]) {
    const invalid = rows(); invalid[5].p_hat = value
    assert.equal(forecastChecks(invalid, 48, issue).ok, false)
  }
})

test('completion requires a saved successful run and a complete forecast', () => {
  const data = { run: { issue_date: issue, status: 'ok' }, rows: rows() }
  assert.equal(completedForecast(data, issue), true)
  assert.equal(completedForecast({ ...data, run: { ...data.run, status: 'low_confidence' } }, issue), true)
  assert.equal(completedForecast({ ...data, run: { ...data.run, status: 'failed' } }, issue), false)
  assert.equal(completedForecast({ ...data, rows: rows(24) }, issue), false)
  assert.equal(completedForecast(data, '2026-02-11'), false)
  assert.equal(completedForecast(null, issue), false)
})

test('partial actual coverage is explicit and errors use only matching hours', () => {
  const data = rows(); data[0].actual = 0.2; data[1].actual = 0.4
  const k = kpis(data, 2.5)
  assert.equal(k.nHours, 48)
  assert.equal(k.nFact, 2)
  assert.equal(k.forecastMwh, 60)
  assert.ok(Math.abs(k.factMwh - 1.5) < 1e-9)
  assert.ok(Math.abs(k.devMwh - 1) < 1e-9)
  const absent = kpis(rows(), 2.5)
  assert.equal(absent.factMwh, null)
  assert.equal(absent.devMwh, null)
  assert.equal(absent.accuracy, null)
})
