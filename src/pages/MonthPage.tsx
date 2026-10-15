import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronDown, ChevronRight, Circle, CircleCheck, GripVertical, Plus } from 'lucide-react'
import { todayISO } from '@/domain/dates'
import { projectInvoices } from '@/domain/invoices'
import { displayOrder, flowItems, idsAfterStatusChange, totalsFor } from '@/domain/summary'
import { pendingCents } from '@/domain/settlement'
import { centsToInput, maskMoney, parseMoneyInput } from '@/domain/money'
import type { FlowItem } from '@/domain/summary'
import type { InvoiceItem, PaymentMethod } from '@/domain/types'
import * as finance from '@/db/finance-repository'
import type { FinanceSnapshot } from '@/db/finance-repository'
import { useFinance } from '@/state/FinanceContext'
import { CompetenceSwitcher, useMonthSlide } from '@/components/finance/CompetenceSwitcher'
import { Money } from '@/components/finance/Money'
import { MoneyInput } from '@/components/finance/MoneyInput'
import { TitleDrawer } from '@/components/finance/TitleDrawer'
import { SettlementDetails, settlementPreset } from '@/components/finance/SettlementDetails'
import { BankMonthPanel } from '@/components/finance/BankMonthPanel'
import { cn } from '@/lib/cn'

export function MonthPage() {
  const { snapshot, loading, competence, setCompetence, mutate } = useFinance()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const focus = params.get('f')
  const openId = params.get('open')
  const [tab, setTab] = useState<'income' | 'expense'>(focus === 'income' ? 'income' : 'expense')
  const [sideBySide, setSideBySide] = useState(true)
  const [target, setTarget] = useState<{ type: 'transaction' | 'invoice'; id: string } | null>(null)
  const [settlement, setSettlement] = useState<{ item: FlowItem; mode: 'settle' | 'reverse' } | null>(null)
  const monthSlide = useMonthSlide(competence)

  useEffect(() => {
    if (focus === 'income') setTab('income')
    if (focus === 'expense' || focus === 'cards') setTab('expense')
  }, [focus])

  useEffect(() => {
    if (!openId || !snapshot) return
    if (openId.startsWith('invoice:')) {
      setTab('expense')
      setTarget((current) => (current?.type === 'invoice' && current.id === openId ? current : { type: 'invoice', id: openId }))
      return
    }
    const transaction = snapshot.transactions.find((item) => item.id === openId)
    if (!transaction) return
    setTab(transaction.kind)
    setTarget((current) => (current?.type === 'transaction' && current.id === openId ? current : { type: 'transaction', id: openId }))
  }, [openId, snapshot])

  const items = useMemo(() => {
    if (!snapshot) return []
    return flowItems({ ...snapshot, cards: snapshot.creditCards }).filter((item) => item.competence === competence)
  }, [snapshot, competence])
  const totals = totalsFor(items, competence)
  const positions = useMemo(() => new Map((snapshot?.listOrders ?? []).map((order) => [order.id, order.position])), [snapshot])
  const income = displayOrder(
    items.filter((item) => item.kind === 'income'),
    positions,
  )
  const expense = displayOrder(
    items.filter((item) => item.kind === 'expense').filter((item) => (focus === 'cards' ? item.source === 'invoice' : true)),
    positions,
  )
  const cardItems = useMemo(() => {
    const grouped = new Map<string, InvoiceItem[]>()
    if (!snapshot) return grouped
    for (const invoice of projectInvoices(snapshot.purchases, snapshot.creditCards)) {
      if (invoice.competence !== competence) continue
      grouped.set(invoice.id, invoice.items)
    }
    return grouped
  }, [snapshot, competence])

  if (loading && !snapshot) return <p>Carregando lançamentos...</p>
  if (!snapshot) return <p>Não foi possível carregar o mês.</p>

  return (
    <div className="mx-auto max-w-6xl">
      <div className="hidden md:block">
        <CompetenceSwitcher competence={competence} onChange={setCompetence} slide showFavorite />
      </div>
      <MobileTotals totals={totals} />
      <div className="overflow-hidden">
      <div key={competence} className={cn(monthSlide === 'forward' && 'month-forward', monthSlide === 'back' && 'month-back')}>
      {focus === 'cards' ? <p className="mt-3 text-sm text-muted-foreground">Exibindo somente as faturas de cartão desta competência.</p> : null}
      <div className="mt-5 grid grid-cols-[1.2fr_1fr_1fr] gap-2 md:hidden">
        <TabButton active={sideBySide} onClick={() => setSideBySide(true)}>
          Lado a lado
        </TabButton>
        <TabButton
          active={!sideBySide && tab === 'income'}
          onClick={() => {
            setSideBySide(false)
            setTab('income')
          }}
        >
          A receber
        </TabButton>
        <TabButton
          active={!sideBySide && tab === 'expense'}
          onClick={() => {
            setSideBySide(false)
            setTab('expense')
          }}
        >
          A pagar
        </TabButton>
      </div>
      <div className={cn('mt-4 grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16rem] md:gap-6', sideBySide && 'grid-cols-2 gap-2')}>
        <Column
          title="Contas a receber"
          shortTitle="Receitas"
          compact={sideBySide}
          items={income}
          hidden={!sideBySide && tab !== 'income'}
          onOpen={setTarget}
          onSettle={(item) => setSettlement({ item, mode: pendingCents(item.amountCents, item.settledCents) <= 0 ? 'reverse' : 'settle' })}
          onSaveAmount={(item, cents) => mutate(() => finance.updateListedAmount(item.source, item.id, cents))}
          onReorder={(ids) => mutate(() => finance.saveListOrder(ids))}
          onCreate={() => navigate('/novo', { state: { kind: 'income', month: competence, returnToMonth: true } })}
        />
        <Column
          title="Contas a pagar"
          shortTitle="Despesas"
          compact={sideBySide}
          items={expense}
          cardItems={cardItems}
          hidden={!sideBySide && tab !== 'expense'}
          onOpen={setTarget}
          onSettle={(item) => setSettlement({ item, mode: pendingCents(item.amountCents, item.settledCents) <= 0 ? 'reverse' : 'settle' })}
          onSaveAmount={(item, cents) =>
            mutate(() => (item.source === 'invoice' ? finance.setInvoiceAmount(item.id, cents) : finance.updateListedAmount(item.source, item.id, cents)))
          }
          onSavePurchase={(purchaseId, installmentNumber, cents) =>
            mutate(() => finance.updatePurchaseAllocation(purchaseId, installmentNumber, cents))
          }
          onReorder={(ids) => mutate(() => finance.saveListOrder(ids))}
          onCreate={() => navigate('/novo', { state: { kind: 'expense', month: competence, returnToMonth: true } })}
        />
        <MonthSummary totals={totals} competence={competence} snapshot={snapshot} />
      </div>
      </div>
      </div>
      <TitleDrawer
        target={target}
        onClose={() => {
          setTarget(null)
          if (!params.get('open')) return
          const next = new URLSearchParams(params)
          next.delete('open')
          setParams(next, { replace: true })
        }}
      />
      <SettlementDialog
        request={settlement}
        onClose={() => setSettlement(null)}
        onConfirm={async (amountCents, payment) => {
          if (!settlement) return
          const targetType = settlement.item.source === 'invoice' ? 'invoice' : 'transaction'
          const list = settlement.item.kind === 'income' ? income : expense
          const settledBefore = pendingCents(settlement.item.amountCents, settlement.item.settledCents) <= 0
          const settledAfter =
            pendingCents(
              settlement.item.amountCents,
              settlement.mode === 'settle' ? settlement.item.settledCents + amountCents : settlement.item.settledCents - amountCents,
            ) <= 0
          const order = settledBefore === settledAfter ? null : idsAfterStatusChange(list, settlement.item.id, settledAfter)
          if (settlement.mode === 'settle') {
            await mutate(async () => {
              await finance.addSettlement({
                targetType,
                targetId: settlement.item.id,
                amountCents,
                date: todayISO(),
                paymentMethod: (payment.paymentMethod || null) as PaymentMethod | null,
                bankId: payment.bankId || null,
                cardId: payment.paymentMethod === 'cartao' ? payment.cardId || null : null,
                allowExcess: false,
              })
              if (order) await finance.saveListOrder(order)
            }, settlement.item.kind === 'income' ? 'Recebimento registrado.' : 'Pagamento registrado.')
            return
          }
          await mutate(async () => {
            await finance.reverseSettlementAmount(targetType, settlement.item.id, amountCents)
            if (order) await finance.saveListOrder(order)
          }, settlement.item.kind === 'income' ? 'Recebimento desfeito.' : 'Pagamento desfeito.')
        }}
      />
    </div>
  )
}

function MobileTotals({ totals }: { totals: ReturnType<typeof totalsFor> }) {
  const [top, setTop] = useState(0)
  const rows = [
    [
      { label: 'A receber', cents: totals.incomePredicted, tone: 'income' as const },
      { label: 'A pagar', cents: totals.expensePredicted, tone: 'expense' as const },
    ],
    [
      { label: 'Recebido', cents: totals.incomeRealized, tone: 'income' as const },
      { label: 'Pago', cents: totals.expenseRealized, tone: 'expense' as const },
    ],
    [
      { label: 'Projetado', cents: totals.projectedBalance, tone: 'auto' as const },
      { label: 'Realizado', cents: totals.realizedBalance, tone: 'auto' as const },
    ],
  ]

  useEffect(() => {
    const header = document.querySelector('header')
    if (!header) return
    const update = () => setTop(header.getBoundingClientRect().height)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      className="sticky z-20 -mx-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:hidden"
      style={{ top }}
      aria-label="Totais do mês"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        {rows.flat().map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2 text-[11px] leading-4">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd>
              <Money cents={row.cents} tone={row.tone} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('h-11 rounded-xl px-2 text-sm font-semibold', active ? 'bg-primary text-white' : 'bg-card border border-border')}>
      {children}
    </button>
  )
}

function MonthSummary({ totals, competence, snapshot }: { totals: ReturnType<typeof totalsFor>; competence: string; snapshot: FinanceSnapshot }) {
  const rows = [
    { label: 'Recebido', cents: totals.incomeRealized, tone: 'income' as const },
    { label: 'Pago', cents: totals.expenseRealized, tone: 'expense' as const },
    { label: 'A receber', cents: totals.incomePredicted, tone: 'income' as const },
    { label: 'A pagar', cents: totals.expensePredicted, tone: 'expense' as const },
    { label: 'Resultado', cents: totals.projectedBalance, tone: 'auto' as const },
  ]
  return (
    <aside className="col-span-2 md:col-span-1">
      <div className="hidden md:block">
        <h2 className="text-base font-semibold">Resumo</h2>
        <dl className="mt-3 rounded-2xl border border-border bg-card px-4">
          {rows.map((row) => (
            <div key={row.label} className={cn('flex items-center justify-between gap-3 border-b border-border py-2.5 text-sm last:border-b-0', row.label === 'Resultado' && 'font-semibold')}>
              <dt className={row.label === 'Resultado' ? 'text-foreground' : 'text-muted-foreground'}>{row.label}</dt>
              <dd>
                <Money cents={row.cents} tone={row.tone} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <BankMonthPanel competence={competence} snapshot={snapshot} />
    </aside>
  )
}

function Column({
  title,
  shortTitle,
  compact,
  items,
  cardItems,
  hidden,
  onOpen,
  onSettle,
  onSaveAmount,
  onSavePurchase,
  onReorder,
  onCreate,
}: {
  title: string
  shortTitle: string
  compact: boolean
  items: FlowItem[]
  cardItems?: Map<string, InvoiceItem[]>
  hidden: boolean
  onOpen: (target: { type: 'transaction' | 'invoice'; id: string }) => void
  onSettle: (item: FlowItem) => void
  onSaveAmount: (item: FlowItem, cents: number) => Promise<unknown>
  onSavePurchase?: (purchaseId: string, installmentNumber: number, cents: number) => Promise<unknown>
  onReorder: (ids: string[]) => Promise<unknown>
  onCreate: () => void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  const dragRef = useRef<{ index: number; pointerId: number; tops: number[]; heights: number[] } | null>(null)
  const overRef = useRef<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [preview, setPreview] = useState<FlowItem[] | null>(null)
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(() => new Set())
  const shown = preview ?? items

  useEffect(() => {
    setPreview(null)
  }, [items])

  function clampIndex(from: number, to: number) {
    const open = pendingCents(items[from].amountCents, items[from].settledCents) > 0
    let start = 0
    let end = items.length - 1
    if (open) {
      end = -1
      for (let index = 0; index < items.length; index += 1) {
        if (pendingCents(items[index].amountCents, items[index].settledCents) > 0) end = index
      }
    } else {
      start = items.findIndex((item) => pendingCents(item.amountCents, item.settledCents) <= 0)
    }
    if (start < 0 || end < start) return from
    return Math.min(end, Math.max(start, to))
  }

  function indexAt(clientY: number, drag: { index: number; tops: number[]; heights: number[] }) {
    let target = drag.tops.length - 1
    for (let index = 0; index < drag.tops.length; index += 1) {
      if (clientY < drag.tops[index] + drag.heights[index] / 2) {
        target = index
        break
      }
    }
    return clampIndex(drag.index, target)
  }

  function previewOffset(index: number) {
    if (dragIndex == null || overIndex == null || dragIndex === overIndex) return 0
    const heights = dragRef.current?.heights ?? []
    if (index === dragIndex) {
      let offset = 0
      if (overIndex > dragIndex) {
        for (let cursor = dragIndex + 1; cursor <= overIndex; cursor += 1) offset += heights[cursor] ?? 0
      } else {
        for (let cursor = overIndex; cursor < dragIndex; cursor += 1) offset -= heights[cursor] ?? 0
      }
      return offset
    }
    if (dragIndex < overIndex && index > dragIndex && index <= overIndex) return -(heights[dragIndex] ?? 0)
    if (dragIndex > overIndex && index >= overIndex && index < dragIndex) return heights[dragIndex] ?? 0
    return 0
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    const next = indexAt(event.clientY, drag)
    overRef.current = next
    setOverIndex(next)
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    const to = overRef.current
    dragRef.current = null
    overRef.current = null
    setDragIndex(null)
    setOverIndex(null)
    if (to == null || to === drag.index) return
    const next = items.slice()
    const [moved] = next.splice(drag.index, 1)
    next.splice(to, 0, moved)
    setPreview(next)
    void onReorder(next.map((item) => item.id))
  }

  return (
    <section className={cn(hidden && 'hidden md:block')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold md:text-base">
          <span className={compact ? 'md:hidden' : 'hidden'}>{shortTitle}</span>
          <span className={compact ? 'hidden md:inline' : 'inline'}>{title}</span>
        </h2>
        <button
          type="button"
          aria-label={`Novo lançamento em ${title}`}
          onClick={onCreate}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-border bg-card p-3 text-xs text-muted-foreground md:text-sm">
          <span className={compact ? 'md:hidden' : 'hidden'}>Nenhum título.</span>
          <span className={compact ? 'hidden md:inline' : 'inline'}>Nenhum título nesta competência.</span>
        </p>
      ) : (
        <ul ref={listRef} className="relative mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {shown.map((item, index) => {
            const pending = pendingCents(item.amountCents, item.settledCents)
            const paid = pending <= 0
            const listedCents = pending > 0 ? pending : item.amountCents
            const offset = preview ? 0 : previewOffset(index)
            const dragging = dragIndex === index
            const records = cardItems?.get(item.id)
            const grouped = Boolean(records)
            const expanded = grouped && !collapsedCards.has(item.id)
            return (
              <li
                key={item.id}
                data-row-index={index}
                style={offset ? { transform: `translateY(${offset}px)` } : undefined}
                className={cn(
                  'bg-card',
                  dragIndex !== null && !dragging && 'transition-transform duration-200 ease-out',
                  dragging && 'relative z-10 rounded-xl shadow-lg ring-2 ring-primary transition-transform duration-200 ease-out',
                )}
              >
                <div
                  className={cn(
                    'grid items-center gap-2 px-2 py-2',
                    compact ? 'grid-cols-1 md:grid-cols-[minmax(0,1fr)_8.5rem_2.75rem] md:gap-3 md:px-3 md:py-2.5' : 'grid-cols-[minmax(0,1fr)_8.5rem_2.75rem] gap-3 px-3 py-2.5',
                  )}
                >
                <div className="flex min-w-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Reordenar ${item.party ?? item.description}`}
                    className="grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground active:cursor-grabbing"
                    onPointerDown={(event) => {
                      if (event.pointerType === 'mouse' && event.button !== 0) return
                      try {
                        event.currentTarget.setPointerCapture(event.pointerId)
                      } catch {
                        // A captura só existe em ponteiros reais. O movimento segue pelo próprio botão.
                      }
                      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-row-index]') ?? [])]
                      dragRef.current = {
                        index,
                        pointerId: event.pointerId,
                        tops: rows.map((row) => row.getBoundingClientRect().top),
                        heights: rows.map((row) => row.getBoundingClientRect().height),
                      }
                      overRef.current = index
                      setDragIndex(index)
                      setOverIndex(index)
                    }}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    <GripVertical className="h-4 w-4" aria-hidden />
                  </button>
                  {grouped ? (
                    <button
                      type="button"
                      className="grid h-8 w-6 shrink-0 place-items-center rounded-lg text-muted-foreground"
                      aria-expanded={expanded}
                      aria-label={expanded ? `Recolher ${item.description}` : `Expandir ${item.description}`}
                      onClick={() =>
                        setCollapsedCards((current) => {
                          const next = new Set(current)
                          if (next.has(item.id)) next.delete(item.id)
                          else next.add(item.id)
                          return next
                        })
                      }
                    >
                      {expanded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      if (grouped) {
                        setCollapsedCards((current) => {
                          const next = new Set(current)
                          if (next.has(item.id)) next.delete(item.id)
                          else next.add(item.id)
                          return next
                        })
                        return
                      }
                      onOpen({ type: 'transaction', id: item.id })
                    }}
                  >
                    {item.party ? (
                      <>
                        <span className="block truncate text-sm font-semibold">{item.party}</span>
                        <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                      </>
                    ) : (
                      <span className="block truncate text-sm font-semibold">{item.description}</span>
                    )}
                  </button>
                </div>
                <div className={cn('flex items-center justify-end gap-1 whitespace-nowrap text-sm', compact && 'md:contents')}>
                  <AmountCell
                    cents={listedCents}
                    tone={item.kind === 'income' ? 'income' : 'expense'}
                    label={grouped ? `Editar valor de ${item.description}` : 'Editar valor'}
                    minCents={grouped && listedCents === item.amountCents ? item.amountCents : undefined}
                    onSave={(cents) => onSaveAmount(item, listedCents === item.amountCents ? cents : item.settledCents + cents)}
                  />
                  <button
                    type="button"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl md:h-11 md:w-11 md:justify-self-end"
                    aria-label={paid ? (item.kind === 'income' ? 'Desfazer recebimento' : grouped ? `Desfazer pagamento de ${item.description}` : 'Desfazer pagamento') : item.kind === 'income' ? 'Baixar recebimento' : grouped ? `Baixar ${item.description}` : 'Baixar pagamento'}
                    onClick={() => onSettle(item)}
                  >
                    {paid ? <CircleCheck className="h-5 w-5 text-income" aria-hidden /> : <Circle className="h-5 w-5 text-muted-foreground" aria-hidden />}
                  </button>
                </div>
                </div>
                {expanded && records ? (
                  <ul className="border-t border-border bg-muted/40">
                    {records.map((record) => (
                      <li key={`${record.purchaseId}-${record.installmentNumber}`} className="flex items-center justify-between gap-3 py-2 pl-12 pr-3">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => onOpen({ type: 'invoice', id: item.id })}
                        >
                          <span className="block truncate text-sm">{record.party ?? record.description}</span>
                          {record.party ? <span className="block truncate text-xs text-muted-foreground">{record.description}</span> : null}
                          {record.installmentCount > 1 ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {record.installmentNumber}/{record.installmentCount}
                            </span>
                          ) : null}
                        </button>
                        <span className="flex shrink-0 items-center gap-2">
                          <AmountCell
                            cents={record.amountCents}
                            tone="expense"
                            label={`Editar valor de ${record.party ?? record.description}`}
                            onSave={(cents) => onSavePurchase?.(record.purchaseId, record.installmentNumber, cents) ?? Promise.resolve()}
                          />
                          {paid ? <CircleCheck className="h-4 w-4 text-income" aria-hidden /> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function AmountCell({
  cents,
  tone,
  onSave,
  label = 'Editar valor',
  minCents,
}: {
  cents: number
  tone: 'income' | 'expense'
  onSave: (cents: number) => Promise<unknown>
  label?: string
  minCents?: number
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    const select = () => inputRef.current?.select()
    select()
    const id = window.setTimeout(select, 0)
    return () => window.clearTimeout(id)
  }, [editing])

  async function commit() {
    if (saving.current) return
    const next = parseMoneyInput(value)
    if (!next) {
      setError('Informe um valor maior que zero.')
      return
    }
    if (minCents != null && next < minCents) {
      setError('O valor mínimo é a soma dos lançamentos.')
      return
    }
    if (next === cents) {
      setEditing(false)
      setError(null)
      return
    }
    saving.current = true
    try {
      await onSave(next)
      setEditing(false)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o valor.')
    } finally {
      saving.current = false
    }
  }

  if (!editing) {
    return (
      <button type="button" className="shrink-0 text-right" aria-label={label} onClick={() => {
        setValue(centsToInput(cents))
        setError(null)
        setEditing(true)
      }}>
        <Money cents={cents} tone={tone} />
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      aria-label="Valor"
      aria-invalid={error ? true : undefined}
      title={error ?? undefined}
      inputMode="numeric"
      value={value}
      style={{ width: `${Math.max(value.length, 4)}ch` }}
      className="max-w-full shrink-0 bg-transparent text-right text-sm font-semibold outline-none"
      onFocus={(event) => {
        const input = event.currentTarget
        window.setTimeout(() => input.select(), 0)
      }}
      onChange={(event) => {
        const next = maskMoney(event.target.value)
        setValue(next)
        setError(null)
        const input = event.target
        const comma = next.lastIndexOf(',')
        const pos = comma === -1 ? next.length : comma
        requestAnimationFrame(() => input.setSelectionRange(pos, pos))
      }}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          void commit()
        }
        if (event.key === 'Escape') {
          setEditing(false)
          setError(null)
        }
      }}
    />
  )
}

function SettlementDialog({
  request,
  onClose,
  onConfirm,
}: {
  request: { item: FlowItem; mode: 'settle' | 'reverse' } | null
  onClose: () => void
  onConfirm: (amountCents: number, payment: { paymentMethod: string; bankId: string; cardId: string }) => Promise<void>
}) {
  const { snapshot } = useFinance()
  const item = request?.item
  const mode = request?.mode ?? 'settle'
  const suggested = item ? (mode === 'settle' ? pendingCents(item.amountCents, item.settledCents) : item.settledCents) : 0
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [bankId, setBankId] = useState('')
  const [cardId, setCardId] = useState('')

  useEffect(() => {
    if (!item) return
    const preset = settlementPreset(snapshot, { id: item.id, source: item.source })
    setValue(centsToInput(suggested))
    setError(null)
    setSaving(false)
    setDetailsOpen(false)
    setPaymentMethod(preset.paymentMethod)
    setBankId(preset.bankId)
    setCardId(preset.cardId)
  }, [item, suggested, snapshot])

  const income = item?.kind === 'income'
  const title = mode === 'settle' ? (income ? 'Baixar recebimento' : 'Baixar pagamento') : income ? 'Desfazer recebimento' : 'Desfazer pagamento'
  const confirmLabel = mode === 'settle' ? 'Baixar' : 'Desfazer baixa'

  async function confirm() {
    if (saving) return
    const cents = parseMoneyInput(value)
    if (!cents) {
      setError('Informe um valor maior que zero.')
      return
    }
    if (cents > suggested) {
      setError(mode === 'settle' ? 'O valor é maior que o saldo do título.' : 'O valor é maior que o total baixado.')
      return
    }
    if (mode === 'settle' && paymentMethod === 'cartao' && !cardId) {
      setDetailsOpen(true)
      setError('Escolha o cartão.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onConfirm(cents, { paymentMethod, bankId, cardId })
      onClose()
    } catch (reason) {
      setSaving(false)
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir.')
    }
  }

  return (
    <Dialog.Root open={request !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#14211b]/40" />
        <Dialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto w-full max-w-md -translate-y-1/2 rounded-2xl bg-card p-5 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {item ? (item.party ? `${item.party} · ${item.description}` : item.description) : ''}
          </Dialog.Description>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            <MoneyInput value={value} onChange={setValue} aria-label="Valor da baixa" />
            {mode === 'settle' ? (
              <SettlementDetails
                open={detailsOpen}
                onToggle={() => setDetailsOpen((current) => !current)}
                paymentMethod={paymentMethod}
                bankId={bankId}
                cardId={cardId}
                banks={snapshot?.banks ?? []}
                cards={snapshot?.creditCards ?? []}
                onPaymentMethod={setPaymentMethod}
                onBank={setBankId}
                onCard={setCardId}
              />
            ) : null}
            {error ? <p className="text-sm text-expense" role="alert">{error}</p> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Dialog.Close type="button" className="h-11 rounded-xl border border-border px-4 font-semibold">
                Cancelar
              </Dialog.Close>
              <button type="submit" autoFocus className="h-11 rounded-xl bg-primary px-4 font-semibold text-white disabled:opacity-50" disabled={saving}>
                {saving ? 'Salvando...' : confirmLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
