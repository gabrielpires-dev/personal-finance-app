export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function dateISO(year: number, month: number, day: number): string {
  const clamped = Math.min(Math.max(day, 1), daysInMonth(year, month))
  return `${year}-${pad(month)}-${pad(clamped)}`
}

export function splitDate(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return { year, month, day }
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const { year, month, day } = splitDate(value)
  if (month < 1 || month > 12 || day < 1) return false
  return day <= daysInMonth(year, month)
}

export function isCompetence(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) && Number(value.slice(5)) >= 1 && Number(value.slice(5)) <= 12
}

export function competenceOf(isoDate: string): string {
  return isoDate.slice(0, 7)
}

export function monthStart(competence: string): string {
  return `${competence}-01`
}

export function monthEnd(competence: string): string {
  const { year, month } = splitDate(`${competence}-01`)
  return dateISO(year, month, 31)
}

export function addMonthsISO(isoDate: string, months: number): string {
  const { year, month, day } = splitDate(isoDate)
  const anchor = new Date(year, month - 1 + months, 1)
  return dateISO(anchor.getFullYear(), anchor.getMonth() + 1, day)
}

export function addDaysISO(isoDate: string, days: number): string {
  const { year, month, day } = splitDate(isoDate)
  const date = new Date(year, month - 1, day + days)
  return dateISO(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function todayISO(now = new Date()): string {
  return dateISO(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function currentCompetence(now = new Date()): string {
  return competenceOf(todayISO(now))
}

export function shiftCompetence(competence: string, offset: number): string {
  return competenceOf(addMonthsISO(monthStart(competence), offset))
}

export function compareIso(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

export function formatDateBR(isoDate: string): string {
  const { year, month, day } = splitDate(isoDate)
  return `${pad(day)}/${pad(month)}/${year}`
}
