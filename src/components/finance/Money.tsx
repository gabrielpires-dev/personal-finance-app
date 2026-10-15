import { formatCents } from '@/domain/money'
import { cn } from '@/lib/cn'

export function Money({
  cents,
  tone = 'neutral',
}: {
  cents: number
  tone?: 'neutral' | 'income' | 'expense' | 'auto'
}) {
  const resolved = tone === 'auto' ? (cents > 0 ? 'income' : cents < 0 ? 'expense' : 'neutral') : tone
  return (
    <span
      className={cn(
        'tabular font-semibold',
        resolved === 'income' && 'text-income',
        resolved === 'expense' && 'text-expense',
      )}
    >
      {formatCents(cents)}
    </span>
  )
}
