export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10)
export const startOfUtcDay = (value: Date | string) => {
  const date = new Date(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}
export function cycleSummary(cycles: { startDate: Date; endDate: Date | null }[]) {
  const sorted = [...cycles].sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
  const lengths = sorted.slice(0, -1).map((cycle, index) => Math.round((cycle.startDate.getTime() - sorted[index + 1].startDate.getTime()) / 86_400_000)).filter((value) => value >= 15 && value <= 60)
  const averageCycleLength = lengths.length ? Math.round(lengths.reduce((sum, value) => sum + value, 0) / lengths.length) : 28
  const latest = sorted[0]
  const estimatedNextPeriod = latest ? new Date(latest.startDate.getTime() + averageCycleLength * 86_400_000) : null
  return { lengths, averageCycleLength, historyCount: sorted.length, estimatedNextPeriod, isEstimate: true }
}
