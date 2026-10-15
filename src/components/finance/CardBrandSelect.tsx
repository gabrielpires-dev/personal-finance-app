import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export const cardBrands = [
  { id: 'visa', label: 'Visa' },
  { id: 'mastercard', label: 'Mastercard' },
  { id: 'elo', label: 'Elo' },
  { id: 'amex', label: 'American Express' },
  { id: 'hipercard', label: 'Hipercard' },
] as const

export type CardBrandId = (typeof cardBrands)[number]['id']

export function matchCardBrand(brand: string | null | undefined) {
  if (!brand) return null
  const normalized = brand.trim().toLocaleLowerCase('pt-BR')
  return cardBrands.find((item) => item.id === normalized || item.label.toLocaleLowerCase('pt-BR') === normalized) ?? null
}

export function BrandMark({ brand, className }: { brand: CardBrandId; className?: string }) {
  const common = cn('h-6 w-9 shrink-0', className)
  if (brand === 'visa') {
    return (
      <svg viewBox="0 0 36 24" className={common} aria-hidden>
        <rect width="36" height="24" rx="4" fill="#1a1f71" />
        <text x="18" y="16" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontStyle="italic" fontFamily="Arial, sans-serif">
          VISA
        </text>
      </svg>
    )
  }
  if (brand === 'mastercard') {
    return (
      <svg viewBox="0 0 36 24" className={common} aria-hidden>
        <rect width="36" height="24" rx="4" fill="white" stroke="#e5e7eb" />
        <circle cx="15" cy="12" r="6" fill="#eb001b" />
        <circle cx="21" cy="12" r="6" fill="#f79e1b" fillOpacity="0.92" />
      </svg>
    )
  }
  if (brand === 'elo') {
    return (
      <svg viewBox="0 0 36 24" className={common} aria-hidden>
        <rect width="36" height="24" rx="4" fill="#111111" />
        <text x="18" y="16" textAnchor="middle" fill="#ffcb05" fontSize="11" fontWeight="700" fontFamily="Arial, sans-serif">
          elo
        </text>
      </svg>
    )
  }
  if (brand === 'amex') {
    return (
      <svg viewBox="0 0 36 24" className={common} aria-hidden>
        <rect width="36" height="24" rx="4" fill="#2e77bc" />
        <text x="18" y="16" textAnchor="middle" fill="white" fontSize="7" fontWeight="700" fontFamily="Arial, sans-serif">
          AMEX
        </text>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 36 24" className={common} aria-hidden>
      <rect width="36" height="24" rx="4" fill="#b3131b" />
      <text x="18" y="15.5" textAnchor="middle" fill="white" fontSize="6.5" fontWeight="700" fontFamily="Arial, sans-serif">
        HIPER
      </text>
    </svg>
  )
}

export function BrandSelect({ value, onChange }: { value: string; onChange: (brand: string) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = matchCardBrand(value)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="flex h-12 w-full items-center gap-2 rounded-xl border border-border bg-white px-3 text-left text-base"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Bandeira"
        onClick={() => setOpen((current) => !current)}
      >
        {selected ? <BrandMark brand={selected.id} /> : null}
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? 'Selecione'}</span>
      </button>
      {open ? (
        <ul className="absolute z-20 mt-1 w-full overflow-auto rounded-xl border border-border bg-card py-1 shadow-md" role="listbox" aria-label="Bandeira">
          <li>
            <button
              type="button"
              role="option"
              aria-selected={!selected}
              className={cn('flex h-11 w-full items-center px-3 text-left', !selected ? 'bg-secondary text-income' : 'hover:bg-secondary')}
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              Não informar
            </button>
          </li>
          {cardBrands.map((brand) => (
            <li key={brand.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected?.id === brand.id}
                className={cn(
                  'flex h-11 w-full items-center gap-2 px-3 text-left',
                  selected?.id === brand.id ? 'bg-secondary text-income' : 'hover:bg-secondary',
                )}
                onClick={() => {
                  onChange(brand.label)
                  setOpen(false)
                }}
              >
                <BrandMark brand={brand.id} />
                <span>{brand.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
