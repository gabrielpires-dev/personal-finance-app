import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

export function LimitedSelect({
  value,
  onChange,
  options,
  ariaLabel,
  visibleCount = 4,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  ariaLabel: string
  visibleCount?: number
}) {
  const [open, setOpen] = useState(false)
  const [above, setAbove] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const menuHeight = Math.min(options.length, visibleCount) * 44
  const selected = options.find((option) => option.value === value) ?? options[0]

  useLayoutEffect(() => {
    if (!open) return
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    const spaceBelow = window.innerHeight - rect.bottom
    setAbove(spaceBelow < menuHeight + 8 && rect.top > spaceBelow)
  }, [open, menuHeight])

  useEffect(() => {
    if (!open) return
    const list = listRef.current
    const current = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (list && current) list.scrollTop = current.offsetTop
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 text-left text-base outline-none focus:border-primary"
      >
        <span className="min-w-0 truncate">{selected?.label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            'absolute z-20 w-full overflow-auto rounded-xl border border-border bg-card shadow-md',
            above ? 'bottom-full mb-1' : 'mt-1',
          )}
          style={{ maxHeight: menuHeight }}
        >
          {options.map((option) => {
            const active = option.value === selected?.value
            return (
              <li key={option.value || 'empty'}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn('flex h-11 w-full items-center px-3 text-left', active ? 'bg-secondary text-income' : 'hover:bg-secondary')}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  {option.label}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
