import { addDaysISO, addMonthsISO, competenceOf, dateISO, monthStart, splitDate } from './dates'
import type { OccurrenceDraft, Recurrence } from './types'

function pushIfInside(
  items: OccurrenceDraft[],
  dueDate: string,
  occurrenceKey: string,
  rangeStart: string,
  rangeEnd: string,
  endDate: string | null,
  startDate: string,
) {
  if (dueDate < startDate || dueDate < rangeStart || dueDate > rangeEnd) return
  if (endDate && dueDate > endDate) return
  items.push({ occurrenceKey, dueDate, competence: competenceOf(dueDate) })
}

export function buildOccurrences(
  recurrence: Recurrence,
  rangeStart: string,
  rangeEnd: string,
): OccurrenceDraft[] {
  if (!recurrence.active) return []
  const items: OccurrenceDraft[] = []

  if (recurrence.frequency === 'weekly' || recurrence.frequency === 'biweekly') {
    const step = recurrence.frequency === 'weekly' ? 7 : 14
    let cursor = recurrence.startDate
    const limit = recurrence.endDate && recurrence.endDate < rangeEnd ? recurrence.endDate : rangeEnd
    while (cursor <= limit) {
      pushIfInside(items, cursor, cursor, rangeStart, rangeEnd, recurrence.endDate, recurrence.startDate)
      cursor = addDaysISO(cursor, step)
    }
    return items
  }

  if (recurrence.frequency === 'yearly') {
    const start = splitDate(recurrence.startDate)
    let year = splitDate(rangeStart).year - 1
    const lastYear = splitDate(rangeEnd).year + 1
    while (year <= lastYear) {
      const dueDate = dateISO(year, start.month, recurrence.dueDay)
      pushIfInside(
        items,
        dueDate,
        String(year),
        rangeStart,
        rangeEnd,
        recurrence.endDate,
        recurrence.startDate,
      )
      year += 1
    }
    return items
  }

  let cursor = monthStart(competenceOf(recurrence.startDate))
  const last = monthStart(competenceOf(rangeEnd))
  while (cursor <= last) {
    const { year, month } = splitDate(cursor)
    const dueDate = dateISO(year, month, recurrence.dueDay)
    pushIfInside(
      items,
      dueDate,
      competenceOf(dueDate),
      rangeStart,
      rangeEnd,
      recurrence.endDate,
      recurrence.startDate,
    )
    cursor = addMonthsISO(cursor, 1)
  }
  return items
}

export function missingOccurrences(
  recurrence: Recurrence,
  existingKeys: Iterable<string>,
  ranges: Array<[string, string]>,
): OccurrenceDraft[] {
  const known = new Set(existingKeys)
  const missing: OccurrenceDraft[] = []
  for (const [start, end] of ranges) {
    for (const occurrence of buildOccurrences(recurrence, start, end)) {
      if (known.has(occurrence.occurrenceKey)) continue
      known.add(occurrence.occurrenceKey)
      missing.push(occurrence)
    }
  }
  return missing
}

export function generationRanges(
  today: string,
  selectedCompetence: string,
  historyMonths: number,
  horizonMonths: number,
): Array<[string, string]> {
  const currentMonth = monthStart(today.slice(0, 7))
  const windowStart = monthStart(addMonthsISO(currentMonth, -historyMonths).slice(0, 7))
  const windowEndDate = addMonthsISO(currentMonth, horizonMonths)
  const windowEnd = dateISO(splitDate(windowEndDate).year, splitDate(windowEndDate).month, 31)
  const ranges: Array<[string, string]> = [[windowStart, windowEnd]]
  const selectedStart = monthStart(selectedCompetence)
  const selectedEnd = dateISO(
    splitDate(selectedStart).year,
    splitDate(selectedStart).month,
    31,
  )
  if (selectedEnd < windowStart || selectedStart > windowEnd) {
    ranges.push([selectedStart, selectedEnd])
  }
  return ranges
}
