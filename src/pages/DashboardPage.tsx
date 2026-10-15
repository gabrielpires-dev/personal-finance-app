import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import config from '@/data/config.json'
import { shiftCompetence } from '@/domain/dates'
import { formatCents } from '@/domain/money'
import { expenseSlices, flowItems, forecastMonths, totalsFor } from '@/domain/summary'
import { useFinance } from '@/state/FinanceContext'
import { competenceLabel, CompetenceSwitcher } from '@/components/finance/CompetenceSwitcher'
import { Money } from '@/components/finance/Money'
import { cn } from '@/lib/cn'

export function DashboardPage() {
  const { snapshot, loading, competence, setCompetence } = useFinance()
  const navigate = useNavigate()
  const openMonth = (target = competence, filter?: string) => {
    navigate(filter ? `/mes?c=${target}&f=${filter}` : `/mes?c=${target}`)
  }

  const model = useMemo(() => {
    if (!snapshot) return null
    const cards = snapshot.creditCards.filter((card) => card.active !== false)
    const items = flowItems({ ...snapshot, cards })
    const totals = totalsFor(items, competence)
    const evolution = Array.from({ length: 6 }, (_, index) => shiftCompetence(competence, index - 5)).map((month) => {
      const monthTotals = totalsFor(items, month)
      return {
        competence: month,
        label: competenceLabel(month).split(' ')[0].slice(0, 3),
        receitas: monthTotals.incomePredicted / 100,
        despesas: monthTotals.expensePredicted / 100,
        saldo: monthTotals.projectedBalance / 100,
        faturas: monthTotals.invoiceTotal / 100,
      }
    })
    const categories = expenseSlices({
      transactions: snapshot.transactions,
      purchases: snapshot.purchases,
      cards,
      settlements: snapshot.settlements,
      competence,
    }).map((slice) => ({
      name: snapshot.categories.find((category) => category.id === slice.categoryId)?.name ?? 'Sem categoria',
      valor: slice.amountCents / 100,
      cents: slice.amountCents,
    }))
    const forecast = forecastMonths({
      anchorCompetence: shiftCompetence(competence, 1),
      count: config.forecastMonths,
      transactions: snapshot.transactions,
      recurrences: snapshot.recurrences,
      purchases: snapshot.purchases,
      cards,
      settlements: snapshot.settlements,
    })
    const forecastChart = forecast.months.map((month) => ({
      competence: month.competence,
      label: competenceLabel(month.competence).split(' ')[0].slice(0, 3),
      receitas: month.incomeCents / 100,
      despesas: month.expenseCents / 100,
      saldo: month.balanceCents / 100,
      faturas: month.invoiceCents / 100,
    }))
    return { totals, evolution, categories, forecast, forecastChart }
  }, [snapshot, competence])

  if (loading && !snapshot) return <p>Carregando o painel...</p>
  if (!snapshot || !model) return <p>Não foi possível montar o painel.</p>
  const hasDemo = snapshot.transactions.some((item) => item.demo) || snapshot.purchases.some((item) => item.demo)

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="hidden md:block">
        <CompetenceSwitcher competence={competence} onChange={setCompetence} />
      </div>
      {hasDemo ? (
        <p className="rounded-2xl bg-[#fff7e8] px-4 py-3 text-sm">
          Há dados de demonstração marcados com [Exemplo]. Eles não substituem seus lançamentos e podem ser removidos em Ajustes.
        </p>
      ) : null}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric title="Receitas previstas" cents={model.totals.incomePredicted} tone="income" hint="Previsto" onClick={() => openMonth(competence, 'income')} />
        <Metric title="Recebido" cents={model.totals.incomeRealized} tone="income" hint="Realizado" onClick={() => openMonth(competence, 'income')} />
        <Metric title="Despesas previstas" cents={model.totals.expensePredicted} tone="expense" hint="Previsto" onClick={() => openMonth(competence, 'expense')} />
        <Metric title="Pago" cents={model.totals.expenseRealized} tone="expense" hint="Realizado" onClick={() => openMonth(competence, 'expense')} />
        <Metric title="Saldo projetado" cents={model.totals.projectedBalance} tone="auto" hint="Projetado" onClick={() => openMonth()} />
        <Metric title="Saldo realizado" cents={model.totals.realizedBalance} tone="auto" hint="Realizado" onClick={() => openMonth()} />
        <Metric title="Faturas do cartão" cents={model.totals.invoiceTotal} tone="expense" hint="Previsto" onClick={() => openMonth(competence, 'cards')} />
        <Metric title="Disponível após compromissos" cents={model.totals.availableAfterCommitments} tone="auto" hint="Recebido − despesas previstas" onClick={() => openMonth()} />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Receitas e despesas" subtitle="Seis competências até o mês selecionado">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={model.evolution} onClick={(state) => jump(state, openMonth)}>
              <CartesianGrid stroke="#e6eee9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis hide />
              <Tooltip formatter={(value) => formatCents(Math.round(Number(value) * 100))} />
              <Legend />
              <Bar dataKey="receitas" name="Receitas" fill="#1f8a4c" radius={6} />
              <Bar dataKey="despesas" name="Despesas" fill="#c45c5c" radius={6} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Saldo mensal" subtitle="Receitas previstas menos despesas previstas">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={model.evolution} onClick={(state) => jump(state, openMonth)}>
              <CartesianGrid stroke="#e6eee9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis hide />
              <Tooltip formatter={(value) => formatCents(Math.round(Number(value) * 100))} />
              <Line dataKey="saldo" name="Saldo" stroke="#146c36" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Faturas de cartão" subtitle="Valor previsto das faturas em cada competência">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={model.evolution} onClick={(state) => jump(state, (month) => openMonth(month, 'cards'))}>
              <CartesianGrid stroke="#e6eee9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis hide />
              <Tooltip formatter={(value) => formatCents(Math.round(Number(value) * 100))} />
              <Bar dataKey="faturas" name="Faturas" fill="#1f8a4c" radius={6} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Despesas por categoria" subtitle="Títulos do mês e compras do cartão pela categoria, sem somar a fatura outra vez">
          {model.categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem despesas previstas nesta competência.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.categories} layout="vertical" margin={{ left: 16 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCents(Math.round(Number(value) * 100))} />
                <Bar dataKey="valor" name="Previsto" radius={6} onClick={() => openMonth(competence, 'expense')}>
                  {model.categories.map((entry) => (
                    <Cell key={entry.name} fill="#1f8a4c" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Próximos seis meses</h2>
        <p className="mt-1 text-sm text-muted-foreground">Projeção a partir da competência seguinte, somente com o que já está cadastrado.</p>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={model.forecastChart} onClick={(state) => jump(state, openMonth)}>
              <CartesianGrid stroke="#e6eee9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis hide />
              <Tooltip formatter={(value) => formatCents(Math.round(Number(value) * 100))} />
              <Legend />
              <Bar dataKey="receitas" name="Receitas" fill="#1f8a4c" radius={6} />
              <Bar dataKey="despesas" name="Despesas" fill="#c45c5c" radius={6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {model.forecast.months.map((month) => (
            <li key={month.competence}>
              <button type="button" className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left hover:bg-secondary" onClick={() => openMonth(month.competence)}>
                <span>{competenceLabel(month.competence)}</span>
                <Money cents={month.balanceCents} tone="auto" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function jump(
  state: { activePayload?: Array<{ payload?: { competence?: string } }> } | null,
  open: (competence: string) => void,
) {
  const competence = state?.activePayload?.[0]?.payload?.competence
  if (competence) open(competence)
}

function Metric({
  title,
  cents,
  tone,
  hint,
  onClick,
}: {
  title: string
  cents: number
  tone: 'income' | 'expense' | 'auto'
  hint: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-border bg-card p-3 text-left shadow-sm">
      <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
      <span className="mt-2 block text-xl">
        <Money cents={cents} tone={tone} />
      </span>
      <span className={cn('mt-1 block text-xs', hint === 'Previsto' ? 'text-muted-foreground' : 'text-income')}>{hint}</span>
    </button>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{subtitle}</p>
      <div className="h-56">{children}</div>
    </section>
  )
}
