import { addMonthsISO, competenceOf } from './dates'

export function splitCents(totalCents: number, count: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error('O valor total precisa ser positivo.')
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('A quantidade de parcelas é inválida.')
  }
  const base = Math.floor(totalCents / count)
  const remainder = totalCents % count
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0))
}

export function installmentDueDates(firstDueDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return firstDueDate
    return addMonthsISO(firstDueDate, index)
  })
}

export interface PlannedInstallment {
  number: number
  count: number
  dueDate: string
  competence: string
  amountCents: number
}

export function planInstallments(
  totalCents: number,
  count: number,
  firstDueDate: string,
): PlannedInstallment[] {
  const amounts = splitCents(totalCents, count)
  const dates = installmentDueDates(firstDueDate, count)
  return amounts.map((amountCents, index) => ({
    number: index + 1,
    count,
    dueDate: dates[index],
    competence: competenceOf(dates[index]),
    amountCents,
  }))
}
