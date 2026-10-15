import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, CreditCard as CreditCardIcon } from 'lucide-react'
import { cardGradient } from '@/domain/card-colors'
import type { CreditCard } from '@/domain/types'
import { cn } from '@/lib/cn'

export function CardMark({ color, className }: { color?: string | null; className?: string }) {
  return (
    <span
      className={cn('grid h-5 w-7 shrink-0 place-items-center rounded-md text-white', className)}
      style={{ background: cardGradient(color) }}
      aria-hidden
    >
      <CreditCardIcon className="h-3 w-3" strokeWidth={2.25} />
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

export function CardSelect({
  cards,
  value,
  onChange,
  emptyLabel = 'Selecione',
  ariaLabel = 'Cartão',
  disabled = false,
}: {
  cards: CreditCard[]
  value: string
  onChange: (value: string) => void
  emptyLabel?: string
  ariaLabel?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ordered = [...cards].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const selected = ordered.find((card) => card.id === value) ?? null
  const { rootRef, above } = useDismiss(open, () => setOpen(false), 288)

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 text-left text-base outline-none focus:border-primary disabled:opacity-60"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <>
              <CardMark color={selected.color} />
              <span className="truncate">{selected.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{emptyLabel}</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className={cn('absolute z-20 w-full overflow-auto rounded-xl border border-border bg-card p-1 shadow-md', above ? 'bottom-full mb-1' : 'mt-1')}
          style={{ maxHeight: 288 }}
        >
          <Option
            active={!value}
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
          >
            <span className="px-1">{emptyLabel}</span>
          </Option>
          {ordered.map((card) => (
            <Option
              key={card.id}
              active={card.id === value}
              onClick={() => {
                onChange(card.id)
                setOpen(false)
              }}
            >
              <CardMark color={card.color} />
              <span className="truncate">{card.name}</span>
            </Option>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Option({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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
