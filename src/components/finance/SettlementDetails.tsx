import { useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import type { FinanceSnapshot } from '@/db/finance-repository'
import type { BankAccount, PaymentMethod } from '@/domain/types'
import { paymentChoices, paymentLabels } from '@/lib/labels'
import { cn } from '@/lib/cn'
import { Field, SelectInput } from '@/components/ui/field'
import { BankSelect, bankForCard } from '@/components/finance/BankSelect'
import { CardSelect } from '@/components/finance/CardSelect'

export function settlementPreset(
  snapshot: FinanceSnapshot | null,
  item: { id: string; source: 'transaction' | 'invoice' } | null,
) {
  if (!snapshot || !item) return { paymentMethod: '', bankId: '', cardId: '' }
  if (item.source === 'invoice') {
    const cardId = item.id.split(':')[1] ?? ''
    const card = snapshot.creditCards.find((entry) => entry.id === cardId && entry.active !== false)
    const bank = snapshot.banks.find((entry) => entry.active !== false && entry.cardIds.includes(cardId))
    return { paymentMethod: 'cartao', bankId: bank?.id ?? '', cardId: card?.id ?? '' }
  }
  const transaction = snapshot.transactions.find((entry) => entry.id === item.id)
  const bank = snapshot.banks.find((entry) => entry.id === transaction?.bankId && entry.active !== false)
  const card = snapshot.creditCards.find((entry) => entry.id === transaction?.cardId && entry.active !== false)
  const paymentMethod = transaction?.paymentMethod ?? ''
  return { paymentMethod, bankId: bank?.id ?? '', cardId: paymentMethod === 'cartao' ? card?.id ?? '' : '' }
}

export function SettlementDetails({
  open,
  onToggle,
  paymentMethod,
  bankId,
  cardId,
  banks,
  cards,
  onPaymentMethod,
  onBank,
  onCard,
}: {
  open: boolean
  onToggle: () => void
  paymentMethod: string
  bankId: string
  cardId: string
  banks: BankAccount[]
  cards: FinanceSnapshot['creditCards']
  onPaymentMethod: (value: string) => void
  onBank: (value: string) => void
  onCard: (value: string) => void
}) {
  const known = paymentChoices as readonly string[]
  const linkedBank = paymentMethod === 'cartao' ? bankForCard(banks, cardId) : null
  useEffect(() => {
    if (linkedBank && bankId !== linkedBank.id) onBank(linkedBank.id)
  }, [linkedBank, bankId, onBank])
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-label="Forma de pagamento e banco"
        onClick={onToggle}
        className="flex items-center gap-1 text-xs text-muted-foreground"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} aria-hidden />
        Forma de pagamento e banco
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <Field label="Forma de pagamento">
            <SelectInput
              value={paymentMethod}
              aria-label="Forma de pagamento da baixa"
              onChange={(event) => {
                onPaymentMethod(event.target.value)
                if (event.target.value !== 'cartao') onCard('')
              }}
            >
              <option value="">Não informada</option>
              {paymentMethod && !known.includes(paymentMethod) ? (
                <option value={paymentMethod}>{paymentLabels[paymentMethod as PaymentMethod]}</option>
              ) : null}
              {paymentChoices.map((value) => (
                <option key={value} value={value}>
                  {paymentLabels[value]}
                </option>
              ))}
            </SelectInput>
          </Field>
          {paymentMethod === 'cartao' ? (
            <Field label="Cartão">
              <CardSelect
                cards={cards.filter((card) => card.active !== false)}
                value={cardId}
                ariaLabel="Cartão da baixa"
                onChange={(nextCard) => {
                  onCard(nextCard)
                  const owner = bankForCard(banks, nextCard)
                  if (owner) onBank(owner.id)
                }}
              />
            </Field>
          ) : null}
          <Field label="Banco" hint={linkedBank ? 'Definido pelo cartão.' : undefined}>
            <BankSelect
              banks={banks}
              value={bankId}
              onChange={onBank}
              ariaLabel="Banco da baixa"
              emptyLabel="Não informar"
              disabled={Boolean(linkedBank)}
            />
          </Field>
        </div>
      ) : null}
    </div>
  )
}
