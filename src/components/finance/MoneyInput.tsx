import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react'
import { maskMoney } from '@/domain/money'
import { cn } from '@/lib/cn'

export { maskMoney }

function caretBeforeCents(value: string) {
  const comma = value.lastIndexOf(',')
  return comma === -1 ? value.length : comma
}

export function MoneyInput({
  value,
  onChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string
  onChange: (value: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const caretRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const input = inputRef.current
    const pos = caretRef.current
    if (!input || pos == null) return
    input.setSelectionRange(pos, pos)
    caretRef.current = null
  }, [value])

  return (
    <div className={cn('flex h-12 items-center rounded-xl border border-border bg-white focus-within:border-primary', className)}>
      <span className="pl-3 text-sm font-semibold text-muted-foreground">R$</span>
      <input
        {...props}
        ref={inputRef}
        value={value}
        inputMode="numeric"
        autoComplete="off"
        placeholder="0,00"
        className="h-full min-w-0 flex-1 bg-transparent px-2 text-base outline-none"
        onChange={(event) => {
          const next = maskMoney(event.target.value)
          caretRef.current = caretBeforeCents(next)
          onChange(next)
          if (next === value) event.target.setSelectionRange(caretRef.current, caretRef.current)
        }}
      />
    </div>
  )
}
