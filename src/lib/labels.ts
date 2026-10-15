import type { EntryKind, Frequency, PaymentMethod, TitleStatus } from '@/domain/types'
import { statusLabel } from '@/domain/settlement'

export const paymentLabels: Record<PaymentMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  debito: 'Débito',
  transferencia: 'Transferência',
  boleto: 'Boleto',
  cartao: 'Cartão de crédito',
  outro: 'Outro',
}

export const paymentChoices = ['pix', 'boleto', 'cartao'] as const satisfies readonly PaymentMethod[]

export const frequencyLabels: Record<Frequency, string> = {
  monthly: 'Mensal',
  yearly: 'Anual',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
}

export function titleStatusLabel(status: TitleStatus, kind: EntryKind) {
  return statusLabel(status, kind)
}
