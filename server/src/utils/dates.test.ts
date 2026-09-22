import { describe, expect, it } from 'vitest'
import { cycleSummary } from './dates.js'

describe('cycleSummary', () => {
  it('uses historical starts to calculate an estimated next period', () => {
    const summary = cycleSummary([
      { startDate: new Date('2026-08-29T00:00:00Z'), endDate: null },
      { startDate: new Date('2026-08-01T00:00:00Z'), endDate: null },
      { startDate: new Date('2026-07-04T00:00:00Z'), endDate: null },
    ])
    expect(summary.averageCycleLength).toBe(28)
    expect(summary.estimatedNextPeriod?.toISOString().slice(0, 10)).toBe('2026-09-26')
    expect(summary.isEstimate).toBe(true)
  })
  it('uses a clearly estimate-only 28-day default with too little history', () => {
    const summary = cycleSummary([{ startDate: new Date('2026-08-29T00:00:00Z'), endDate: null }])
    expect(summary.averageCycleLength).toBe(28)
    expect(summary.historyCount).toBe(1)
  })
})
