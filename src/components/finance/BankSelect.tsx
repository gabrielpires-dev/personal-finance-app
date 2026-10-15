import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { institutionById, institutions, type Institution } from '@/domain/institutions'
import type { BankAccount } from '@/domain/types'
import { cn } from '@/lib/cn'

export function bankForCard(banks: BankAccount[], cardId: string) {
  if (!cardId) return null
  return banks.find((bank) => bank.active !== false && bank.cardIds.includes(cardId)) ?? null
}

export function bankAccountLabel(bank: BankAccount) {
  const name = institutionById(bank.institutionId)?.name ?? 'Banco'
  const details = [bank.agency ? `Ag ${bank.agency}` : '', bank.account ? `Cc ${bank.account}` : ''].filter(Boolean)
  return details.length ? `${name} · ${details.join(' · ')}` : name
}

export function BankMark({ institution, className }: { institution: Institution; className?: string }) {
  return (
    <span
      className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[9px] font-bold leading-none', className)}
      style={{ background: institution.color, color: institution.ink }}
      aria-hidden
    >
      {institution.mark}
    </span>
  )
}

function useDismiss(open: boolean, onClose: () => void, menuHeight: number) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [above, setAbove] = useState(false)

  useLayoutEffect(() => {
    if (!open) return
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    const spaceBelow = window.innerHeight - rect.bottom
    setAbove(spaceBelow < menuHeight + 8 && rect.top > spaceBelow)
  }, [open, menuHeight])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  return { rootRef, above }
}

function MenuShell({
  open,
  onClose,
  ariaLabel,
  selected,
  menuHeight,
  children,
  onToggle,
  disabled = false,
}: {
  open: boolean
  onClose: () => void
  onToggle: () => void
  ariaLabel: string
  selected: ReactNode
  menuHeight: number
  disabled?: boolean
  children: ReactNode
}) {
  const { rootRef, above } = useDismiss(open, onClose, menuHeight)

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={onToggle}
        className="flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 text-left text-base outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-muted/60 disabled:text-foreground"
      >
        <span className="flex min-w-0 items-center gap-2">{selected}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open && !disabled ? (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className={cn('absolute z-20 w-full overflow-auto rounded-xl border border-border bg-card p-1 shadow-md', above ? 'bottom-full mb-1' : 'mt-1')}
          style={{ maxHeight: menuHeight }}
        >
          {children}
        </ul>
      ) : null}
    </div>
  )
}

function OptionButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={active}
        onClick={onClick}
        className={cn('flex h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm', active ? 'bg-secondary font-semibold text-income' : 'hover:bg-muted')}
      >
        {children}
      </button>
    </li>
  )
}

export function InstitutionSelect({
  value,
  onChange,
  ariaLabel = 'Instituição',
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = institutionById(value)
  return (
    <MenuShell
      open={open}
      onClose={() => setOpen(false)}
      onToggle={() => setOpen((current) => !current)}
      ariaLabel={ariaLabel}
      menuHeight={288}
      selected={
        selected ? (
          <>
            <BankMark institution={selected} />
            <span className="truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Selecione o banco</span>
        )
      }
    >
      {institutions.map((institution) => (
        <OptionButton
          key={institution.id}
          active={institution.id === value}
          onClick={() => {
            onChange(institution.id)
            setOpen(false)
          }}
        >
          <BankMark institution={institution} />
          <span className="truncate">{institution.name}</span>
        </OptionButton>
      ))}
    </MenuShell>
  )
}

export function BankSelect({
  banks,
  value,
  onChange,
  ariaLabel = 'Banco',
  emptyLabel = 'Não vincular',
  disabled = false,
}: {
  banks: BankAccount[]
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
  emptyLabel?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ordered = [...banks]
    .filter((bank) => bank.active !== false)
    .sort((a, b) => bankAccountLabel(a).localeCompare(bankAccountLabel(b), 'pt-BR'))
  const selected = ordered.find((bank) => bank.id === value) ?? null
  const institution = selected ? institutionById(selected.institutionId) : null

  return (
    <MenuShell
      open={open && !disabled}
      onClose={() => setOpen(false)}
      onToggle={() => {
        if (!disabled) setOpen((current) => !current)
      }}
      ariaLabel={ariaLabel}
      menuHeight={288}
      disabled={disabled}
      selected={
        selected && institution ? (
          <>
            <BankMark institution={institution} />
            <span className="truncate">{bankAccountLabel(selected)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{emptyLabel}</span>
        )
      }
    >
      <OptionButton
        active={!value}
        onClick={() => {
          onChange('')
          setOpen(false)
        }}
      >
        <span className="px-1">{emptyLabel}</span>
      </OptionButton>
      {ordered.map((bank) => {
        const mark = institutionById(bank.institutionId)
        return (
          <OptionButton
            key={bank.id}
            active={bank.id === value}
            onClick={() => {
              onChange(bank.id)
              setOpen(false)
            }}
          >
            {mark ? <BankMark institution={mark} /> : null}
            <span className="truncate">{bankAccountLabel(bank)}</span>
          </OptionButton>
        )
      })}
    </MenuShell>
  )
}
