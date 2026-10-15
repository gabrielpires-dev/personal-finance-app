import { describe, expect, it } from 'vitest'
import { buildBackup, parseBackup } from './backup'
import { suggestCategoryIcon } from './category-icons'
import { addMonthsISO, competenceOf, dateISO } from './dates'
import { planInstallments, splitCents } from './installments'
import { allocatePurchase, cycleFromPurchaseDate, projectInvoices, purchaseAmountPatch } from './invoices'
import { maskMoney, parseMoneyInput } from './money'
import { missingPartyDetails } from './party-details'
import { generationRanges, missingOccurrences } from './recurrence'
import { evaluateSettlement, pendingCents, reverseSettlement, statusFromAmounts } from './settlement'
import { bankMonthBalances } from './bank-balance'
import { displayOrder, expenseSlices, flowItems, forecastMonths, idsAfterStatusChange, totalsFor } from './summary'
import type { FlowItem } from './summary'
import type {
  AppSettings,
  Category,
  Settlement,
  CreditCard,
  CreditCardPurchase,
  Recurrence,
  Transaction,
} from './types'

const now = '2026-03-01T12:00:00.000Z'

function flowItem(id: string, amountCents: number, settledCents: number): FlowItem {
  return {
    id,
    kind: 'expense',
    competence: '2026-11',
    dueDate: '2026-11-01',
    amountCents,
    settledCents,
    categoryId: 'cat',
    source: 'transaction',
    description: id,
    party: null,
  }
}

function category(id: string, kind: Category['kind'] = 'expense'): Category {
  return { id, name: id, kind, icon: 'tag', archived: false }
}

function transaction(partial: Partial<Transaction> & Pick<Transaction, 'id' | 'amountCents' | 'dueDate' | 'kind'>): Transaction {
  return {
    description: partial.id,
    categoryId: 'cat-combustivel',
    party: null,
    entryDate: partial.dueDate,
    competence: partial.dueDate.slice(0, 7),
    paymentMethod: null,
    notes: null,
    recurrenceId: null,
    occurrenceKey: null,
    detached: false,
    installmentGroupId: null,
    installmentNumber: null,
    installmentCount: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

function settlement(id: string, targetId: string, amountCents: number, targetType: Settlement['targetType'] = 'transaction'): Settlement {
  return {
    id,
    targetType,
    targetId,
    amountCents,
    date: '2026-11-15',
    note: null,
    status: 'active',
    reversedAt: null,
    createdAt: now,
  }
}

function recurrence(partial: Partial<Recurrence> = {}): Recurrence {
  return {
    id: 'rec-aluguel',
    kind: 'expense',
    description: 'Aluguel',
    categoryId: 'cat-moradia',
    amountCents: 150000,
    startDate: '2026-01-05',
    frequency: 'monthly',
    dueDay: 31,
    endDate: null,
    active: true,
    party: null,
    paymentMethod: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

describe('baixas parciais', () => {
  const base: Settlement = {
    id: 's1',
    targetType: 'transaction',
    targetId: 't1',
    amountCents: 30000,
    date: '2026-10-05',
    note: null,
    status: 'active',
    reversedAt: null,
    createdAt: now,
  }

  it('calcula o saldo depois de pagamentos parciais', () => {
    const settlements = [
      base,
      { ...base, id: 's2', amountCents: 30000, date: '2026-10-12' },
      { ...base, id: 's3', amountCents: 40000, date: '2026-10-25' },
    ]
    const settled = settlements.reduce((sum, item) => sum + item.amountCents, 0)
    expect(settled).toBe(100000)
    expect(pendingCents(100000, settled)).toBe(0)
    expect(statusFromAmounts(100000, 30000)).toBe('partial')
    expect(statusFromAmounts(100000, 100000)).toBe('settled')
    expect(statusFromAmounts(100000, 0)).toBe('pending')
  })

  it('estorna uma baixa e devolve o saldo', () => {
    const reversed = reverseSettlement(base, '2026-10-06T00:00:00.000Z')
    expect(reversed.status).toBe('reversed')
    expect(reversed.reversedAt).toBe('2026-10-06T00:00:00.000Z')
    const active = [reversed].filter((item) => item.status === 'active')
    expect(pendingCents(100000, active.reduce((sum, item) => sum + item.amountCents, 0))).toBe(100000)
    expect(() => reverseSettlement(reversed, now)).toThrow(/estornada/)
  })

  it('exige confirmação quando a baixa excede o saldo', () => {
    expect(evaluateSettlement(20000, 30000, false).ok).toBe(false)
    expect(evaluateSettlement(20000, 30000, true).ok).toBe(true)
    expect(evaluateSettlement(20000, 0, true).ok).toBe(false)
  })
})

describe('recorrências e parcelas', () => {
  it('gera ocorrências mensais sem duplicar e respeita meses curtos', () => {
    const rule = recurrence()
    const first = missingOccurrences(rule, [], [['2026-01-01', '2026-04-30']])
    expect(first.map((item) => item.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
    const second = missingOccurrences(rule, first.map((item) => item.occurrenceKey), [['2026-01-01', '2026-04-30']])
    expect(second).toEqual([])
  })

  it('vira o ano e usa 29 de fevereiro em ano bissexto', () => {
    const rule = recurrence({ startDate: '2023-12-31', dueDay: 31 })
    const items = missingOccurrences(rule, [], [['2023-12-01', '2024-02-29']])
    expect(items.map((item) => item.dueDate)).toEqual(['2023-12-31', '2024-01-31', '2024-02-29'])
    expect(items.map((item) => item.occurrenceKey)).toEqual(['2023-12', '2024-01', '2024-02'])
  })

  it('não gera além do fim nem quando está inativa', () => {
    const ended = recurrence({ endDate: '2026-02-15', dueDay: 10, startDate: '2026-01-01' })
    expect(missingOccurrences(ended, [], [['2026-01-01', '2026-06-30']]).map((item) => item.dueDate)).toEqual([
      '2026-01-10',
      '2026-02-10',
    ])
    expect(missingOccurrences({ ...ended, active: false }, [], [['2026-01-01', '2026-06-30']])).toEqual([])
  })

  it('limita o horizonte padrão e só acrescenta a competência consultada fora dele', () => {
    const ranges = generationRanges('2026-10-14', '2028-01', 12, 6)
    expect(ranges[0][0].startsWith('2025-10')).toBe(true)
    expect(ranges[0][1].startsWith('2027-04')).toBe(true)
    expect(ranges[1]).toEqual(['2028-01-01', '2028-01-31'])
  })

  it('divide parcelas preservando o total e a sequência', () => {
    const plan = planInstallments(100000, 6, '2026-11-15')
    expect(plan.map((item) => `${item.number}/${item.count}`)).toEqual(['1/6', '2/6', '3/6', '4/6', '5/6', '6/6'])
    expect(plan.reduce((sum, item) => sum + item.amountCents, 0)).toBe(100000)
    expect(splitCents(100, 3)).toEqual([34, 33, 33])
    expect(plan[5].dueDate).toBe('2027-04-15')
    expect(plan[5].competence).toBe('2027-04')
  })
})

describe('cartão e consolidação', () => {
  const card: CreditCard = {
    id: 'card-1',
    name: 'Nubank',
    brand: 'visa',
    limitCents: 500000,
    closingDay: 10,
    dueDay: 17,
    active: true,
    createdAt: now,
  }

  const purchase: CreditCardPurchase = {
    id: 'buy-1',
    cardId: 'card-1',
    description: 'Mercado',
    categoryId: 'cat-alimentacao',
    party: 'Mercado',
    purchaseDate: '2026-12-11',
    totalCents: 30000,
    installmentCount: 3,
    notes: null,
    createdAt: now,
  }

  it('joga a compra após o fechamento para a fatura seguinte e atravessa o ano', () => {
    const cycle = cycleFromPurchaseDate('2026-12-11', 10, 17)
    expect(cycle.closingDate).toBe('2027-01-10')
    expect(cycle.dueDate).toBe('2027-01-17')
    const onClosing = cycleFromPurchaseDate('2026-12-10', 10, 17)
    expect(onClosing.competence).toBe('2026-12')
    const nextMonthDue = cycleFromPurchaseDate('2026-03-20', 25, 5)
    expect(nextMonthDue.closingDate).toBe('2026-03-25')
    expect(nextMonthDue.dueDate).toBe('2026-04-05')
  })

  it('altera só a parcela editada e mantém as outras', () => {
    const patch = purchaseAmountPatch(purchase, 2, 15000)
    expect(patch.totalCents).toBe(35000)
    expect(patch.installmentAmountsCents).toEqual([10000, 15000, 10000])
    const allocated = allocatePurchase({ ...purchase, ...patch }, card)
    expect(allocated.map((item) => item.amountCents)).toEqual([10000, 15000, 10000])
  })

  it('projeta parcelas nas faturas e não conta a compra duas vezes', () => {
    const allocated = allocatePurchase(purchase, card)
    expect(allocated.map((item) => item.competence)).toEqual(['2027-01', '2027-02', '2027-03'])
    expect(allocated.reduce((sum, item) => sum + item.amountCents, 0)).toBe(30000)

    const fuel = transaction({
      id: 'fuel',
      kind: 'expense',
      amountCents: 100000,
      dueDate: '2027-01-20',
      categoryId: 'cat-combustivel',
    })
    const items = flowItems({
      transactions: [fuel],
      purchases: [purchase],
      cards: [card],
      settlements: [],
    })
    const january = totalsFor(items, '2027-01')
    expect(january.expensePredicted).toBe(100000 + 10000)
    expect(january.invoiceTotal).toBe(10000)
    expect(items.filter((item) => item.competence === '2027-01')).toHaveLength(2)

    const slices = expenseSlices({
      transactions: [fuel],
      purchases: [purchase],
      cards: [card],
      competence: '2027-01',
    })
    expect(slices).toEqual([
      { categoryId: 'cat-combustivel', amountCents: 100000 },
      { categoryId: 'cat-alimentacao', amountCents: 10000 },
    ])
    expect(slices.reduce((sum, slice) => sum + slice.amountCents, 0)).toBe(january.expensePredicted)
  })

  it('movimenta o saldo do banco só no mês do título e da transferência', () => {
    const banks = [
      { id: 'a', institutionId: 'itau', agency: '1', account: '1', cardIds: ['card-1'], active: true, createdAt: now },
      { id: 'b', institutionId: 'nubank', agency: '2', account: '2', cardIds: [], active: true, createdAt: now },
    ]
    const transactions = [
      transaction({ id: 'in', kind: 'income', amountCents: 10000, dueDate: '2026-11-05', categoryId: 'cat-salario', bankId: 'a' }),
      transaction({ id: 'out', kind: 'expense', amountCents: 3000, dueDate: '2026-11-10', categoryId: 'cat-moradia', bankId: 'a' }),
      transaction({ id: 'later', kind: 'expense', amountCents: 9000, dueDate: '2026-12-10', categoryId: 'cat-moradia', bankId: 'a' }),
    ]
    const settlements = [
      settlement('s1', 'in', 4000),
      settlement('s2', 'out', 1000),
      settlement('s3', 'later', 9000),
      { ...settlement('s4', 'in', 500), status: 'reversed' as const },
      settlement('s5', 'invoice:card-1:2026-11', 700, 'invoice'),
    ]
    const november = bankMonthBalances({
      competence: '2026-11',
      banks,
      transactions,
      settlements,
      transfers: [{ id: 't', competence: '2026-11', fromBankId: 'a', toBankId: 'b', amountCents: 500, createdAt: now }],
      adjustments: [{ id: 'adj', bankId: 'a', competence: '2026-11', amountCents: -200 }],
    })
    expect(november.find((item) => item.bankId === 'a')?.cents).toBe(4000 - 1000 - 700 - 500 - 200)
    expect(november.find((item) => item.bankId === 'b')?.cents).toBe(500)
    const december = bankMonthBalances({ competence: '2026-12', banks, transactions, settlements, transfers: [] })
    expect(december.find((item) => item.bankId === 'a')?.cents).toBe(-9000)
    expect(december.find((item) => item.bankId === 'b')?.cents).toBe(0)
    const split = bankMonthBalances({
      competence: '2026-11',
      banks,
      transactions,
      settlements: [
        { ...settlement('pix', 'out', 400), bankId: 'b' },
        settlement('rest', 'out', 600),
      ],
      transfers: [],
    })
    expect(split.find((item) => item.bankId === 'a')?.cents).toBe(-600)
    expect(split.find((item) => item.bankId === 'b')?.cents).toBe(-400)
    const cardPayment = bankMonthBalances({
      competence: '2026-11',
      banks,
      transactions,
      settlements: [{ ...settlement('card', 'out', 700), paymentMethod: 'cartao', bankId: 'b', cardId: 'card-1' }],
      transfers: [],
    })
    expect(cardPayment.find((item) => item.bankId === 'a')?.cents).toBe(0)
    expect(cardPayment.find((item) => item.bankId === 'b')?.cents).toBe(0)
  })

  it('mostra o restante do título e leva a baixa do cartão para a fatura', () => {
    const fuel = transaction({ id: 'fuel', kind: 'expense', amountCents: 100000, dueDate: '2026-11-30', categoryId: 'cat-combustivel' })
    const cardSettlement = {
      ...settlement('baixa', 'fuel', 70000),
      paymentMethod: 'cartao' as const,
      cardId: 'card-1',
    }
    const purchase: CreditCardPurchase = {
      id: 'compra',
      cardId: 'card-1',
      description: 'Combustível/Veículo',
      categoryId: 'cat-combustivel',
      party: 'Combustível',
      purchaseDate: '2026-10-15',
      totalCents: 70000,
      installmentCount: 1,
      notes: null,
      settlementId: 'baixa',
      createdAt: now,
    }
    const items = flowItems({
      transactions: [fuel],
      purchases: [purchase],
      cards: [card],
      settlements: [cardSettlement],
    })
    const title = items.find((item) => item.id === 'fuel')
    const invoice = items.find((item) => item.source === 'invoice')
    expect(pendingCents(title?.amountCents ?? 0, title?.settledCents ?? 0)).toBe(30000)
    expect(invoice?.amountCents).toBe(70000)
    const totals = totalsFor(items, '2026-11')
    expect(totals.expensePredicted).toBe(30000 + 70000)
    expect(totals.expenseRealized).toBe(0)
  })

  it('mantém a ordem salva e leva baixados para o fim', () => {
    const open = flowItem('a', 100, 0)
    const later = flowItem('b', 100, 0)
    const paid = flowItem('c', 100, 100)
    const positions = new Map([
      ['b', 0],
      ['a', 1],
      ['c', 2],
    ])
    expect(displayOrder([paid, later, open], positions).map((item) => item.id)).toEqual(['b', 'a', 'c'])
    expect(idsAfterStatusChange([open, later], open.id, true)).toEqual(['b', 'a'])
  })

  it('separa previsto e realizado pelas baixas, inclusive da fatura', () => {
    const income = transaction({ id: 'salary', kind: 'income', amountCents: 500000, dueDate: '2027-01-05', categoryId: 'cat-salario' })
    const rent = transaction({ id: 'rent', kind: 'expense', amountCents: 150000, dueDate: '2027-01-10', categoryId: 'cat-moradia' })
    const settlements: Settlement[] = [
      {
        id: 'a',
        targetType: 'transaction',
        targetId: 'salary',
        amountCents: 500000,
        date: '2027-01-05',
        note: null,
        status: 'active',
        reversedAt: null,
        createdAt: now,
      },
      {
        id: 'b',
        targetType: 'transaction',
        targetId: 'rent',
        amountCents: 50000,
        date: '2027-01-10',
        note: null,
        status: 'active',
        reversedAt: null,
        createdAt: now,
      },
      {
        id: 'c',
        targetType: 'invoice',
        targetId: 'invoice:card-1:2027-01',
        amountCents: 4000,
        date: '2027-01-17',
        note: null,
        status: 'active',
        reversedAt: null,
        createdAt: now,
      },
    ]
    const totals = totalsFor(
      flowItems({ transactions: [income, rent], purchases: [purchase], cards: [card], settlements }),
      '2027-01',
    )
    expect(totals.incomePredicted).toBe(500000)
    expect(totals.incomeRealized).toBe(500000)
    expect(totals.expensePredicted).toBe(160000)
    expect(totals.expenseRealized).toBe(54000)
    expect(totals.projectedBalance).toBe(340000)
    expect(totals.realizedBalance).toBe(446000)
    expect(totals.pendingBalance).toBe(-106000)
    expect(totals.availableAfterCommitments).toBe(340000)
  })
})

describe('previsão e backup', () => {
  it('projeta só o que já existe e não inventa meses vazios', () => {
    const salary = recurrence({
      id: 'rec-salario',
      kind: 'income',
      description: 'Salário',
      categoryId: 'cat-salario',
      amountCents: 400000,
      startDate: '2026-01-05',
      dueDay: 5,
    })
    const result = forecastMonths({
      anchorCompetence: '2026-05',
      count: 6,
      transactions: [],
      recurrences: [salary],
      purchases: [],
      cards: [],
    })
    expect(result.months).toHaveLength(6)
    expect(result.months.every((month) => month.incomeCents === 400000 && month.expenseCents === 0)).toBe(true)

    const again = forecastMonths({
      anchorCompetence: '2026-05',
      count: 2,
      transactions: [
        transaction({
          id: 'already',
          kind: 'income',
          amountCents: 400000,
          dueDate: '2026-05-05',
          categoryId: 'cat-salario',
          recurrenceId: 'rec-salario',
          occurrenceKey: '2026-05',
        }),
      ],
      recurrences: [salary],
      purchases: [],
      cards: [],
    })
    expect(again.months[0].incomeCents).toBe(400000)
  })

  it('aceita um backup íntegro e recusa arquivo inválido sem produzir dados parciais', () => {
    const settings: AppSettings = {
      id: 'app',
      schemaVersion: 1,
      lastBackupAt: null,
      lastCompetence: '2026-10',
      createdAt: now,
    }
    const backup = buildBackup(
      {
        app: 'personal-finance',
        schemaVersion: 1,
        categories: [category('cat-salario', 'income')],
        transactions: [
          transaction({
            id: 't1',
            kind: 'income',
            amountCents: 100,
            dueDate: '2026-10-05',
            categoryId: 'cat-salario',
          }),
        ],
        settlements: [],
        recurrences: [],
        creditCards: [],
        purchases: [],
        installmentGroups: [],
        parties: [],
        settings,
      },
      '2026-10-14T15:00:00.000Z',
    )
    const parsed = parseBackup(backup)
    expect(parsed.ok).toBe(true)

    const broken = parseBackup({ ...backup, schemaVersion: 99 })
    expect(broken.ok).toBe(false)
    if (!broken.ok) expect(broken.errors[0]).toMatch(/nenhum dado local foi alterado/)

    const dangling = parseBackup({
      ...backup,
      transactions: [{ ...backup.transactions[0], categoryId: 'missing' }],
    })
    expect(dangling.ok).toBe(false)
  })

  it('completa só os dados que o contato ainda não tinha', () => {
    const current = { categoryId: 'cat-academia', paymentMethod: 'cartao' as const, bankId: null, cardId: null }
    expect(missingPartyDetails(current, {
      categoryId: 'cat-outra',
      paymentMethod: 'pix',
      bankId: 'banco',
      cardId: 'cartao',
    })).toEqual({ bankId: 'banco', cardId: 'cartao' })
    expect(missingPartyDetails(
      { categoryId: null, paymentMethod: 'pix', bankId: null, cardId: null },
      { categoryId: 'cat', paymentMethod: 'cartao', bankId: 'banco', cardId: 'cartao' },
    )).toEqual({ categoryId: 'cat', bankId: 'banco' })
    expect(missingPartyDetails(
      { categoryId: null, paymentMethod: null, bankId: null, cardId: null },
      { categoryId: 'cat', paymentMethod: 'cartao', bankId: 'banco', cardId: 'cartao' },
    )).toEqual({ categoryId: 'cat', paymentMethod: 'cartao', bankId: 'banco', cardId: 'cartao' })
  })

  it('interpreta valores em reais no formato brasileiro', () => {
    expect(parseMoneyInput('1.234,56')).toBe(123456)
    expect(parseMoneyInput('10,5')).toBe(1050)
    expect(parseMoneyInput('10.50')).toBe(1050)
    expect(parseMoneyInput('0')).toBeNull()
    expect(maskMoney('5')).toBe('5,00')
    expect(maskMoney('1500')).toBe('1.500,00')
    expect(maskMoney('5,00')).toBe('5,00')
  })

  it('sugere ícones pelos nomes conhecidos das categorias', () => {
    expect(suggestCategoryIcon('Academia')).toBe('dumbbell')
    expect(suggestCategoryIcon('Cartão de crédito')).toBe('creditCard')
    expect(suggestCategoryIcon('Salário')).toBe('banknote')
    expect(suggestCategoryIcon('Algo novo')).toBe('tag')
  })
})

describe('datas', () => {
  it('soma meses sem deslocar pelo fuso', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsISO('2026-12-15', 1)).toBe('2027-01-15')
    expect(competenceOf('2027-01-15')).toBe('2027-01')
    expect(dateISO(2026, 2, 31)).toBe('2026-02-28')
  })

  it('agrupa faturas do mesmo cartão e competência', () => {
    const card: CreditCard = {
      id: 'c',
      name: 'Inter',
      brand: null,
      limitCents: null,
      closingDay: 1,
      dueDay: 8,
      active: true,
      createdAt: now,
    }
    const invoices = projectInvoices(
      [
        {
          id: 'p1',
          cardId: 'c',
          description: 'A',
          categoryId: 'cat-lazer',
          party: null,
          purchaseDate: '2026-05-01',
          totalCents: 2000,
          installmentCount: 1,
          notes: null,
          createdAt: now,
        },
        {
          id: 'p2',
          cardId: 'c',
          description: 'B',
          categoryId: 'cat-lazer',
          party: null,
          purchaseDate: '2026-04-20',
          totalCents: 3000,
          installmentCount: 1,
          notes: null,
          createdAt: now,
        },
      ],
      [card],
    )
    expect(invoices).toHaveLength(1)
    expect(invoices[0].amountCents).toBe(5000)
    expect(invoices[0].competence).toBe('2026-05')
  })
})
