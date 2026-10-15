import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRightLeft } from 'lucide-react'
import { bankMonthBalances } from '@/domain/bank-balance'
import { institutionById } from '@/domain/institutions'
import { centsToInput, parseMoneyInput, parseSignedMoneyInput } from '@/domain/money'
import type { BankAccount } from '@/domain/types'
import type { FinanceSnapshot } from '@/db/finance-repository'
import * as finance from '@/db/finance-repository'
import { useFinance } from '@/state/FinanceContext'
import { BankMark, BankSelect } from '@/components/finance/BankSelect'
import { Money } from '@/components/finance/Money'
import { MoneyInput, maskMoney } from '@/components/finance/MoneyInput'
import { Field } from '@/components/ui/field'

function maskSignedMoney(value: string) {
  const negative = (value.match(/-/g)?.length ?? 0) % 2 === 1
  const masked = maskMoney(value.replace(/-/g, ''))
  if (!masked) return negative ? '-' : ''
  return negative ? `-${masked}` : masked
}

export function BankMonthPanel({ competence, snapshot }: { competence: string; snapshot: FinanceSnapshot }) {
  const { mutate } = useFinance()
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [toBankId, setToBankId] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const banks = snapshot.banks ?? []
  const adjustments = snapshot.bankBalances ?? []
  const balances = bankMonthBalances({
    competence,
    banks,
    transactions: snapshot.transactions,
    settlements: snapshot.settlements,
    transfers: snapshot.bankTransfers ?? [],
    adjustments,
  })
  const centsOf = new Map(balances.map((item) => [item.bankId, item.cents]))
  const rows = banks
    .filter((bank) => bank.active !== false || (centsOf.get(bank.id) ?? 0) !== 0)
    .map((bank) => ({ bank, cents: centsOf.get(bank.id) ?? 0 }))
    .sort((a, b) => (institutionById(a.bank.institutionId)?.name ?? '').localeCompare(institutionById(b.bank.institutionId)?.name ?? '', 'pt-BR'))
  const activeBanks = banks.filter((bank) => bank.active !== false)
  const source = banks.find((bank) => bank.id === sourceId) ?? null

  function closeTransfer() {
    setSourceId(null)
    setToBankId('')
    setAmount('')
    setError(null)
    setSaving(false)
  }

  async function confirm() {
    if (saving || !source) return
    const cents = parseMoneyInput(amount)
    if (!toBankId) {
      setError('Escolha o banco de destino.')
      return
    }
    if (toBankId === source.id) {
      setError('Escolha um banco diferente.')
      return
    }
    if (!cents) {
      setError('Informe um valor maior que zero.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await mutate(
        () => finance.addBankTransfer({ competence, fromBankId: source.id, toBankId, amountCents: cents }),
        'Transferência registrada.',
      )
      closeTransfer()
    } catch (reason) {
      setSaving(false)
      setError(reason instanceof Error ? reason.message : 'Não foi possível transferir.')
    }
  }

  async function saveBalance(bank: BankAccount, desiredCents: number) {
    const current = centsOf.get(bank.id) ?? 0
    const adjustment = adjustments.find((item) => item.bankId === bank.id && item.competence === competence)
    const movement = current - (adjustment?.amountCents ?? 0)
    await mutate(
      () => finance.saveBankAdjustment({ bankId: bank.id, competence, amountCents: desiredCents - movement }),
      'Saldo atualizado.',
    )
  }

  return (
    <section className="mt-5" aria-label="Saldos dos bancos">
      <h2 className="text-base font-semibold">Saldos</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum banco ativo.</p>
      ) : (
        <ul className="mt-3 rounded-2xl border border-border bg-card px-3">
          {rows.map(({ bank, cents }) => {
            const institution = institutionById(bank.institutionId)
            const name = institution?.name ?? 'Banco'
            const shared = rows.filter((row) => institutionById(row.bank.institutionId)?.name === name).length > 1
            const label = shared ? `${name} · ${bank.account}` : name
            return (
              <li key={bank.id} className="flex items-center gap-2 border-b border-border py-2.5 text-sm last:border-b-0">
                {institution ? <BankMark institution={institution} /> : null}
                <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                <BalanceEditor cents={cents} label={label} onSave={(next) => saveBalance(bank, next)} />
                {activeBanks.length > 1 && bank.active !== false ? (
                  <button
                    type="button"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                    aria-label={`Transferir de ${label}`}
                    onClick={() => {
                      closeTransfer()
                      setSourceId(bank.id)
                    }}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      <Dialog.Root open={source != null} onOpenChange={(next) => { if (!next) closeTransfer() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[#14211b]/40" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-x-4 top-1/2 z-50 mx-auto w-full max-w-md -translate-y-1/2 rounded-2xl bg-card p-5 shadow-xl">
            <Dialog.Title className="text-lg font-semibold">
              Transferir de {source ? institutionById(source.institutionId)?.name ?? 'banco' : 'banco'}
            </Dialog.Title>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                void confirm()
              }}
            >
              <Field label="Para">
                <BankSelect
                  banks={activeBanks.filter((bank) => bank.id !== source?.id)}
                  value={toBankId}
                  onChange={setToBankId}
                  ariaLabel="Banco de destino"
                  emptyLabel="Selecione"
                />
              </Field>
              <Field label="Valor">
                <MoneyInput value={amount} onChange={setAmount} aria-label="Valor da transferência" />
              </Field>
              {error ? <p className="text-sm text-expense" role="alert">{error}</p> : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Dialog.Close type="button" className="h-11 rounded-xl border border-border px-4 font-semibold">
                  Cancelar
                </Dialog.Close>
                <button type="submit" className="h-11 rounded-xl bg-primary px-4 font-semibold text-white disabled:opacity-50" disabled={saving}>
                  {saving ? 'Salvando...' : 'Transferir'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}

function BalanceEditor({
  cents,
  label,
  onSave,
}: {
  cents: number
  label: string
  onSave: (cents: number) => Promise<unknown>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)
  const skipBlur = useRef(false)

  async function commit() {
    if (saving.current) return
    const next = parseSignedMoneyInput(value)
    if (next == null) {
      setError('Informe o saldo.')
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
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o saldo.')
    } finally {
      saving.current = false
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="shrink-0 text-right"
        aria-label={`Editar saldo de ${label}`}
        onClick={() => {
          setValue(cents < 0 ? `-${centsToInput(cents)}` : centsToInput(cents))
          setError(null)
          setEditing(true)
        }}
      >
        <Money cents={cents} tone="auto" />
      </button>
    )
  }

  return (
    <span className="shrink-0">
      <input
        autoFocus
        aria-label={`Saldo de ${label}`}
        inputMode="text"
        value={value}
        className="h-8 w-24 rounded-lg border border-primary bg-white px-2 text-right text-sm outline-none"
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const next = maskSignedMoney(event.target.value)
          setValue(next)
          setError(null)
          const input = event.target
          const comma = next.lastIndexOf(',')
          const pos = comma === -1 ? next.length : comma
          requestAnimationFrame(() => input.setSelectionRange(pos, pos))
        }}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false
            return
          }
          void commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void commit()
          }
          if (event.key === 'Escape') {
            skipBlur.current = true
            setEditing(false)
            setError(null)
          }
        }}
      />
      {error ? <span className="sr-only" role="alert">{error}</span> : null}
    </span>
  )
}
