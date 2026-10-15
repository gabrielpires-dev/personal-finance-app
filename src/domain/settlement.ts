import type { EntryKind, Settlement, TitleStatus } from './types'

export function activeSettledCents(settlements: Settlement[]): number {
  return settlements.reduce((sum, settlement) => {
    if (settlement.status !== 'active') return sum
    return sum + settlement.amountCents
  }, 0)
}

export function pendingCents(amountCents: number, settledCents: number): number {
  return Math.max(0, amountCents - settledCents)
}

export function statusFromAmounts(amountCents: number, settledCents: number): TitleStatus {
  if (settledCents <= 0) return 'pending'
  if (settledCents < amountCents) return 'partial'
  if (settledCents === amountCents) return 'settled'
  return 'overpaid'
}

export function statusLabel(status: TitleStatus, kind: EntryKind): string {
  if (status === 'pending') return 'Pendente'
  if (status === 'partial') return 'Parcial'
  if (status === 'overpaid') return kind === 'income' ? 'Recebido a maior' : 'Pago a maior'
  return kind === 'income' ? 'Recebido' : 'Pago'
}

export interface SettleDecision {
  ok: boolean
  message?: string
}

export function evaluateSettlement(
  pending: number,
  amountCents: number,
  allowExcess: boolean,
): SettleDecision {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, message: 'Informe um valor maior que zero.' }
  }
  if (amountCents > pending && !allowExcess) {
    return {
      ok: false,
      message: 'O valor é maior que o saldo pendente. Confirme para registrar mesmo assim.',
    }
  }
  return { ok: true }
}

export function reverseSettlement<T extends Settlement>(settlement: T, reversedAt: string): T {
  if (settlement.status === 'reversed') {
    throw new Error('Esta baixa já foi estornada.')
  }
  return { ...settlement, status: 'reversed', reversedAt }
}
