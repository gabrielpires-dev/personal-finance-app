import { useEffect, useMemo, useState } from 'react'
import { formatDateBR, todayISO } from '@/domain/dates'
import { centsToInput, parseMoneyInput } from '@/domain/money'
import { activeSettledCents, pendingCents, statusFromAmounts } from '@/domain/settlement'
import { projectInvoices } from '@/domain/invoices'
import { resolveCategoryIcon } from '@/domain/category-icons'
import type { FormEvent } from 'react'
import type { PaymentMethod } from '@/domain/types'
import { FinanceError } from '@/db/finance-repository'
import * as finance from '@/db/finance-repository'
import { useFinance } from '@/state/FinanceContext'
import { frequencyLabels, paymentChoices, paymentLabels, titleStatusLabel } from '@/lib/labels'
import { Money } from './Money'
import { MoneyInput } from './MoneyInput'
import { Button } from '@/components/ui/button'
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/field'
import { CategorySelect } from '@/components/finance/CategoryFields'
import { BankSelect, bankAccountLabel, bankForCard } from '@/components/finance/BankSelect'
import { CardSelect } from '@/components/finance/CardSelect'
import { SettlementDetails, settlementPreset } from '@/components/finance/SettlementDetails'
import { institutionById } from '@/domain/institutions'
import { ConfirmDialog, Sheet } from '@/components/ui/sheet'

export function TitleDrawer({
  target,
  onClose,
}: {
  target: { type: 'transaction' | 'invoice'; id: string } | null
  onClose: () => void
}) {
  const { snapshot, mutate } = useFinance()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [allowExcess, setAllowExcess] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editBankId, setEditBankId] = useState('')
  const [editPaymentMethod, setEditPaymentMethod] = useState('')
  const [editCardId, setEditCardId] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [reverseId, setReverseId] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [settlePayment, setSettlePayment] = useState('')
  const [settleBank, setSettleBank] = useState('')
  const [settleCard, setSettleCard] = useState('')
  const [scope, setScope] = useState<'one' | 'future'>('one')
  const [confirmDelete, setConfirmDelete] = useState<null | { title: string; description: string; run: () => Promise<void> }>(null)

  const transaction = snapshot?.transactions.find((item) => item.id === target?.id)
  const invoice = useMemo(() => {
    if (!snapshot || target?.type !== 'invoice') return null
    return projectInvoices(snapshot.purchases, snapshot.creditCards).find((item) => item.id === target.id) ?? null
  }, [snapshot, target])

  const settlements = (snapshot?.settlements ?? []).filter(
    (item) => item.targetType === target?.type && item.targetId === target?.id,
  )
  const settled = activeSettledCents(settlements)
  const original = target?.type === 'transaction' ? transaction?.amountCents ?? 0 : invoice?.amountCents ?? 0
  const pending = pendingCents(original, settled)
  const kind = target?.type === 'invoice' ? 'expense' : transaction?.kind ?? 'expense'
  const status = statusFromAmounts(original, settled)
  const category = snapshot?.categories.find((item) => item.id === (transaction?.categoryId ?? ''))

  useEffect(() => {
    if (!target) return
    const preset = settlementPreset(snapshot, { id: target.id, source: target.type })
    setDetailsOpen(false)
    setSettlePayment(preset.paymentMethod)
    setSettleBank(preset.bankId)
    setSettleCard(preset.cardId)
  }, [target, snapshot])

  async function submitSettlement(force = false) {
    if (!target) return
    const cents = parseMoneyInput(amount)
    if (!cents) {
      setFormError('Informe um valor maior que zero.')
      return
    }
    if (settlePayment === 'cartao' && !settleCard) {
      setDetailsOpen(true)
      setFormError('Escolha o cartão.')
      return
    }
    try {
      await mutate(() =>
        finance.addSettlement({
          targetType: target.type,
          targetId: target.id,
          amountCents: cents,
          date,
          note,
          paymentMethod: (settlePayment || null) as PaymentMethod | null,
          bankId: settleBank || null,
          cardId: settlePayment === 'cartao' ? settleCard || null : null,
          allowExcess: force || allowExcess,
        }),
      )
      setAmount('')
      setNote('')
      setDetailsOpen(false)
      setAllowExcess(false)
      setFormError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível registrar a baixa.'
      if (message.includes('Confirme')) {
        setAllowExcess(true)
        setFormError(message)
        return
      }
      setFormError(message)
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!transaction) return
    const form = new FormData(event.currentTarget)
    const cents = parseMoneyInput(String(form.get('amount') ?? ''))
    if (!cents) {
      setFormError('Informe um valor maior que zero.')
      return
    }
    if (editPaymentMethod === 'cartao' && !editCardId) {
      setFormError('Escolha o cartão.')
      return
    }
    const input = {
      kind: transaction.kind,
      description: String(form.get('description') ?? ''),
      categoryId: String(form.get('categoryId') ?? ''),
      party: String(form.get('party') ?? ''),
      entryDate: String(form.get('entryDate') ?? ''),
      dueDate: String(form.get('dueDate') ?? ''),
      amountCents: cents,
      paymentMethod: (editPaymentMethod || null) as PaymentMethod | null,
      bankId: editBankId || null,
      cardId: editPaymentMethod === 'cartao' ? editCardId || null : null,
      notes: String(form.get('notes') ?? ''),
    }
    try {
      await mutate(async () => {
        if (transaction.recurrenceId && scope === 'future') {
          const rule = snapshot?.recurrences.find((item) => item.id === transaction.recurrenceId)
          if (!rule) throw new FinanceError('Recorrência não encontrada.')
          await finance.updateRecurrenceRule(
            rule.id,
            {
              description: input.description.replace(/ \d+\/\d+$/, ''),
              categoryId: input.categoryId,
              amountCents: input.amountCents,
              party: input.party || null,
              paymentMethod: input.paymentMethod,
              bankId: input.bankId,
              ...(transaction.kind === 'income' ? { cardId: input.cardId } : {}),
              notes: input.notes || null,
              dueDay: Number(input.dueDate.slice(8, 10)),
            },
            transaction.dueDate,
          )
          return
        }
        if (transaction.recurrenceId) await finance.detachTransaction(transaction.id)
        await finance.updateTransaction(transaction.id, input)
      }, 'Lançamento atualizado.')
      setEditing(false)
      setFormError(null)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar.')
    }
  }

  const title = target?.type === 'invoice' ? invoice?.cardName ? `Fatura ${invoice.cardName}` : 'Fatura' : transaction?.description ?? 'Lançamento'
  const siblings = transaction?.installmentGroupId
    ? (snapshot?.transactions ?? [])
        .filter((item) => item.installmentGroupId === transaction.installmentGroupId)
        .sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0))
    : []

  return (
    <>
      <Sheet
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={title}
      >
        {!transaction && !invoice ? <p>Este título não está mais disponível.</p> : null}
        {transaction || invoice ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Status" value={titleStatusLabel(status, kind)} />
              <Info label="Vencimento" value={formatDateBR(transaction?.dueDate ?? invoice?.dueDate ?? todayISO())} />
              <Info label="Original" value={<Money cents={original} />} />
              <Info label={kind === 'income' ? 'Recebido' : 'Pago'} value={<Money cents={settled} tone={kind === 'income' ? 'income' : 'expense'} />} />
              <Info label="Pendente" value={<Money cents={pending} />} />
              {category ? <Info label="Categoria" value={category.name} /> : null}
              {transaction?.party ? <Info label={kind === 'income' ? 'Cliente' : 'Estabelecimento'} value={transaction.party} /> : null}
              {transaction?.bankId && (snapshot?.banks ?? []).some((bank) => bank.id === transaction.bankId && bank.active !== false) ? (
                <Info label="Banco" value={bankAccountLabel((snapshot?.banks ?? []).find((bank) => bank.id === transaction.bankId)!)} />
              ) : null}
              {transaction?.cardId && (snapshot?.creditCards ?? []).some((card) => card.id === transaction.cardId && card.active !== false) ? (
                <Info label="Cartão" value={(snapshot?.creditCards ?? []).find((card) => card.id === transaction.cardId)?.name ?? ''} />
              ) : null}
              {invoice ? <Info label="Fechamento" value={formatDateBR(invoice.closingDate)} /> : null}
            </div>
            {transaction && !editing ? (
              <Button
                variant="outline"
                onClick={() => {
                  setEditCategoryId(transaction.categoryId)
                  setEditAmount(centsToInput(transaction.amountCents))
                  setEditPaymentMethod(transaction.paymentMethod ?? '')
                  const nextCard = (snapshot?.creditCards ?? []).some((card) => card.id === transaction.cardId && card.active !== false)
                    ? transaction.cardId ?? ''
                    : ''
                  const cardForBank = transaction.paymentMethod === 'cartao' ? nextCard : ''
                  const owner = bankForCard(snapshot?.banks ?? [], cardForBank)
                  setEditCardId(nextCard)
                  setEditBankId(
                    owner?.id ??
                      ((snapshot?.banks ?? []).some((bank) => bank.id === transaction.bankId && bank.active !== false) ? transaction.bankId ?? '' : ''),
                  )
                  setEditing(true)
                }}
              >
                Editar lançamento
              </Button>
            ) : null}
            {editing && transaction ? (
              <form className="space-y-3" onSubmit={saveEdit}>
                <Field label="Descrição">
                  <TextInput name="description" defaultValue={transaction.description} required />
                </Field>
                <Field label="Categoria">
                  <CategorySelect
                    name="categoryId"
                    value={editCategoryId}
                    onChange={setEditCategoryId}
                    kind={transaction.kind}
                    onCreate={async ({ name, icon, kind: nextKind }) => {
                      const id = await mutate(() => finance.saveCategory({ name, kind: nextKind, icon }), 'Categoria adicionada.')
                      setEditCategoryId(id)
                    }}
                    categories={(snapshot?.categories ?? [])
                      .filter((item) => item.kind === transaction.kind)
                      .map((item) => ({ id: item.id, name: item.name, icon: resolveCategoryIcon(item.icon, item.name) }))
                      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))}
                  />
                </Field>
                <Field label="Valor original">
                  <MoneyInput name="amount" aria-label="Valor original" value={editAmount} onChange={setEditAmount} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Lançamento">
                    <TextInput name="entryDate" type="date" defaultValue={transaction.entryDate} required />
                  </Field>
                  <Field label="Vencimento">
                    <TextInput name="dueDate" type="date" defaultValue={transaction.dueDate} required />
                  </Field>
                </div>
                <Field label={transaction.kind === 'income' ? 'Cliente' : 'Estabelecimento'}>
                  <SelectInput
                    name="party"
                    defaultValue={transaction.party ?? ''}
                    onChange={(event) => {
                      const selected = (snapshot?.parties ?? []).find(
                        (item) => item.kind === (transaction.kind === 'income' ? 'client' : 'establishment') && item.description === event.target.value,
                      )
                      const activeCard = (snapshot?.creditCards ?? []).find((card) => card.id === selected?.cardId && card.active !== false)
                      const nextCard = selected?.paymentMethod === 'cartao' && activeCard ? activeCard.id : ''
                      setEditPaymentMethod(selected?.paymentMethod ?? '')
                      setEditCardId(nextCard)
                      const linked = (snapshot?.banks ?? []).find((bank) => bank.id === selected?.bankId && bank.active !== false)
                      const owner = bankForCard(snapshot?.banks ?? [], nextCard)
                      setEditBankId(owner?.id ?? linked?.id ?? '')
                    }}
                  >
                    <option value="">Não informar</option>
                    {transaction.party &&
                    !(snapshot?.parties ?? []).some(
                      (item) =>
                        item.kind === (transaction.kind === 'income' ? 'client' : 'establishment') &&
                        item.description === transaction.party,
                    ) ? (
                      <option value={transaction.party}>{transaction.party}</option>
                    ) : null}
                    {(snapshot?.parties ?? [])
                      .filter((item) => item.kind === (transaction.kind === 'income' ? 'client' : 'establishment'))
                      .sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'))
                      .map((item) => (
                        <option key={item.id} value={item.description}>
                          {item.description}
                        </option>
                      ))}
                  </SelectInput>
                </Field>
                <Field label="Banco" hint={editPaymentMethod === 'cartao' && bankForCard(snapshot?.banks ?? [], editCardId) ? 'Definido pelo cartão.' : undefined}>
                  <BankSelect
                    banks={snapshot?.banks ?? []}
                    value={editBankId}
                    onChange={setEditBankId}
                    emptyLabel="Não informar"
                    disabled={Boolean(editPaymentMethod === 'cartao' && bankForCard(snapshot?.banks ?? [], editCardId))}
                  />
                </Field>
                <Field label="Forma de pagamento">
                  <SelectInput
                    name="paymentMethod"
                    value={editPaymentMethod}
                    onChange={(event) => {
                      setEditPaymentMethod(event.target.value)
                      if (event.target.value !== 'cartao') setEditCardId('')
                    }}
                  >
                    <option value="">Não informada</option>
                    {transaction.paymentMethod && !paymentChoices.includes(transaction.paymentMethod as (typeof paymentChoices)[number]) ? (
                      <option value={transaction.paymentMethod}>{paymentLabels[transaction.paymentMethod]}</option>
                    ) : null}
                    {paymentChoices.map((value) => (
                      <option key={value} value={value}>
                        {paymentLabels[value]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                {editPaymentMethod === 'cartao' ? (
                  <Field label="Cartão">
                    <CardSelect
                      cards={(snapshot?.creditCards ?? []).filter((card) => card.active !== false)}
                      value={editCardId}
                      onChange={(nextCard) => {
                        setEditCardId(nextCard)
                        const owner = bankForCard(snapshot?.banks ?? [], nextCard)
                        if (owner) setEditBankId(owner.id)
                      }}
                    />
                  </Field>
                ) : null}
                <Field label="Observações">
                  <TextArea name="notes" defaultValue={transaction.notes ?? ''} />
                </Field>
                {transaction.recurrenceId ? (
                  <fieldset className="space-y-2 text-sm">
                    <legend className="font-semibold">Alcance da alteração</legend>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={scope === 'one'} onChange={() => setScope('one')} />
                      Somente esta ocorrência
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={scope === 'future'} onChange={() => setScope('future')} />
                      Esta e as próximas ainda sem baixa
                    </label>
                  </fieldset>
                ) : null}
                <div className="flex gap-2">
                  <Button type="submit">Salvar</Button>
                  <Button variant="ghost" onClick={() => setEditing(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : null}
            {invoice ? (
              <div>
                <h3 className="font-semibold">Compras da fatura</h3>
                <ul className="mt-2 space-y-2">
                  {invoice.items.map((item) => (
                    <li key={`${item.purchaseId}-${item.installmentNumber}`} className="rounded-xl border border-border p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{item.description}</p>
                          <p className="text-muted-foreground">
                            {item.installmentNumber}/{item.installmentCount} · compra em {formatDateBR(item.purchaseDate)}
                          </p>
                        </div>
                        <Money cents={item.amountCents} tone="expense" />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {snapshot?.purchases.some((entry) => entry.id === item.purchaseId && entry.settlementId) ? null : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-0 text-expense"
                          onClick={() =>
                            setConfirmDelete({
                              title: 'Excluir este título',
                              description: 'Somente esta ocorrência sai da série. As demais permanecem.',
                              run: async () => {
                                const purchase = snapshot?.purchases.find((entry) => entry.id === item.purchaseId)
                                if (purchase?.recurrenceId || item.installmentCount > 1) {
                                  await finance.deletePurchaseSeries(item.purchaseId, item.installmentNumber, 'one')
                                } else {
                                  await finance.deletePurchase(item.purchaseId)
                                }
                              },
                            })
                          }
                        >
                          Excluir este
                        </Button>
                        )}
                        {item.installmentCount > 1 || snapshot?.purchases.some((entry) => entry.id === item.purchaseId && entry.recurrenceId) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-0 text-expense"
                            onClick={() =>
                              setConfirmDelete({
                                title: 'Excluir este e os seguintes',
                                description: 'Este título e os seguintes da mesma série serão excluídos. Os anteriores permanecem.',
                                run: () => finance.deletePurchaseSeries(item.purchaseId, item.installmentNumber, 'following'),
                              })
                            }
                          >
                            Excluir este e os seguintes
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {siblings.length > 1 ? (
              <div>
                <h3 className="font-semibold">Parcelas</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {siblings.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span>
                        {item.installmentNumber}/{item.installmentCount} · {formatDateBR(item.dueDate)}
                      </span>
                      <Money cents={item.amountCents} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <form
              className="space-y-3 rounded-2xl bg-secondary/60 p-3"
              onSubmit={(event) => {
                event.preventDefault()
                void submitSettlement(false)
              }}
            >
              <h3 className="font-semibold">{kind === 'income' ? 'Registrar recebimento' : 'Registrar pagamento'}</h3>
              <Field label="Valor" error={formError ?? undefined}>
                <MoneyInput value={amount} onChange={setAmount} aria-label="Valor da baixa" />
              </Field>
              <SettlementDetails
                open={detailsOpen}
                onToggle={() => setDetailsOpen((current) => !current)}
                paymentMethod={settlePayment}
                bankId={settleBank}
                cardId={settleCard}
                banks={snapshot?.banks ?? []}
                cards={snapshot?.creditCards ?? []}
                onPaymentMethod={setSettlePayment}
                onBank={setSettleBank}
                onCard={setSettleCard}
              />
              <Field label="Data">
                <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
              </Field>
              <Field label="Observação">
                <TextInput value={note} onChange={(event) => setNote(event.target.value)} />
              </Field>
              {allowExcess ? (
                <Button type="button" variant="destructive" onClick={() => void submitSettlement(true)}>
                  Confirmar valor acima do saldo
                </Button>
              ) : (
                <Button type="submit">Adicionar baixa</Button>
              )}
            </form>
            <div>
              <h3 className="font-semibold">Histórico de baixas</h3>
              {settlements.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhuma baixa registrada.</p> : null}
              <ul className="mt-2 space-y-2">
                {settlements
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((item) => (
                    <li key={item.id} className="rounded-xl border border-border p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{formatDateBR(item.date)}</p>
                          <p className="text-muted-foreground">{item.status === 'reversed' ? 'Estornada' : item.note || 'Sem observação'}</p>
                          <SettlementCaption item={item} banks={snapshot?.banks ?? []} cards={snapshot?.creditCards ?? []} />
                        </div>
                        <Money cents={item.amountCents} />
                      </div>
                      {item.status === 'active' ? (
                        <Button variant="ghost" size="sm" className="mt-2 px-0 text-expense" onClick={() => setReverseId(item.id)}>
                          Estornar
                        </Button>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
            {transaction ? (
              <div className="space-y-2">
                {transaction.recurrenceId ? (
                  <p className="text-sm text-muted-foreground">
                    Este título faz parte de uma recorrência {frequencyLabels[snapshot?.recurrences.find((item) => item.id === transaction.recurrenceId)?.frequency ?? 'monthly']}.
                    {transaction.detached ? ' Ele foi desvinculado da regra.' : ''}
                  </p>
                ) : null}
                {transaction.installmentGroupId ? (
                  <p className="text-sm text-muted-foreground">
                    Parcela {transaction.installmentNumber}/{transaction.installmentCount} do mesmo parcelamento.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setConfirmDelete({
                        title: 'Excluir este título',
                        description: 'Somente este título será excluído. Os demais da série permanecem.',
                        run: () => finance.deleteTransactionSeries(transaction.id, 'one'),
                      })
                    }
                  >
                    Excluir este título
                  </Button>
                  {transaction.recurrenceId || transaction.installmentGroupId ? (
                    <Button
                      variant="outline"
                      className="text-expense"
                      onClick={() =>
                        setConfirmDelete({
                          title: 'Excluir este e os seguintes',
                          description: 'Este título e todos os seguintes da mesma recorrência ou do mesmo parcelamento serão excluídos. Os anteriores permanecem.',
                          run: () => finance.deleteTransactionSeries(transaction.id, 'following'),
                        })
                      }
                    >
                      Excluir este e os seguintes
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Sheet>
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={confirmDelete?.title ?? 'Excluir'}
        description={confirmDelete?.description ?? ''}
        confirmLabel="Excluir"
        destructive
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
        onConfirm={() => {
          const pending = confirmDelete
          setConfirmDelete(null)
          if (!pending) return
          void mutate(pending.run)
            .then(() => {
              if (transaction) onClose()
            })
            .catch((error: unknown) => setFormError(error instanceof Error ? error.message : 'Não foi possível excluir.'))
        }}
      />
      <ConfirmDialog
        open={Boolean(reverseId)}
        title="Estornar baixa"
        description="O histórico será mantido e o saldo do título será recalculado."
        confirmLabel="Estornar"
        destructive
        onOpenChange={(open) => {
          if (!open) setReverseId(null)
        }}
        onConfirm={() => {
          if (!reverseId) return
          const id = reverseId
          setReverseId(null)
          void mutate(() => finance.reverseSettlementById(id), 'Baixa estornada.')
        }}
      />
    </>
  )
}

function SettlementCaption({
  item,
  banks,
  cards,
}: {
  item: { paymentMethod?: PaymentMethod | null; bankId?: string | null; cardId?: string | null }
  banks: { id: string; institutionId: string }[]
  cards: { id: string; name: string }[]
}) {
  const method = item.paymentMethod ? paymentLabels[item.paymentMethod] : null
  const card = cards.find((entry) => entry.id === item.cardId)
  const bank = banks.find((entry) => entry.id === item.bankId)
  const bankName = bank ? institutionById(bank.institutionId)?.name : null
  const text = [method, card?.name, bankName].filter(Boolean).join(' · ')
  if (!text) return null
  return <p className="text-xs text-muted-foreground">{text}</p>
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <div className="font-semibold">{value}</div>
    </div>
  )
}
