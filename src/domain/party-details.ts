import type { PaymentMethod } from '@/domain/types'

export interface PartyDetailSource {
  categoryId?: string | null
  paymentMethod?: PaymentMethod | null
  bankId?: string | null
  cardId?: string | null
}

export function missingPartyDetails(current: PartyDetailSource, incoming: PartyDetailSource): PartyDetailSource {
  const patch: PartyDetailSource = {}
  if (!current.categoryId && incoming.categoryId) patch.categoryId = incoming.categoryId
  if (!current.paymentMethod && incoming.paymentMethod) patch.paymentMethod = incoming.paymentMethod
  if (!current.bankId && incoming.bankId) patch.bankId = incoming.bankId
  const method = current.paymentMethod || patch.paymentMethod
  if (!current.cardId && incoming.cardId && method === 'cartao') patch.cardId = incoming.cardId
  return patch
}
