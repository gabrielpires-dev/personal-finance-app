import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { isCompetence, shiftCompetence } from '@/domain/dates'
import * as finance from '@/db/finance-repository'
import { useFinance } from '@/state/FinanceContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

export function competenceLabel(competence: string) {
  const [year, month] = competence.split('-').map(Number)
  const label = format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: ptBR })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function useMonthSlide(competence: string) {
  const previous = useRef(competence)
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null)

  useEffect(() => {
    if (previous.current === competence) return
    setDirection(competence > previous.current ? 'forward' : 'back')
    previous.current = competence
  }, [competence])

  return direction
}

export function CompetenceSwitcher({
  competence,
  onChange,
  slide = false,
  showFavorite = false,
}: {
  competence: string
  onChange: (competence: string) => void
  slide?: boolean
  showFavorite?: boolean
}) {
  const direction = useMonthSlide(competence)
  const { snapshot, mutate } = useFinance()
  const saved = snapshot?.settings.favoriteCompetence
  const favorite = saved && isCompetence(saved) ? saved : null
  const marked = favorite === competence

  function toggleFavorite() {
    void mutate(() => finance.setFavoriteCompetence(marked ? null : competence))
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => onChange(shiftCompetence(competence, -1))}>
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <div className="min-w-0 flex-1 overflow-hidden text-center">
        <div key={competence} className={cn(slide && direction === 'forward' && 'month-forward', slide && direction === 'back' && 'month-back')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competência</p>
          <p className="flex items-center justify-center gap-1 text-lg font-semibold">
            <span>{competenceLabel(competence)}</span>
            {showFavorite ? (
              <button
                type="button"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
                aria-pressed={marked}
                aria-label={marked ? 'Remover mês favorito' : 'Favoritar mês'}
                onClick={toggleFavorite}
              >
                <Star className={cn('h-3.5 w-3.5', marked ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground')} />
              </button>
            ) : null}
          </p>
        </div>
      </div>
      <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => onChange(shiftCompetence(competence, 1))}>
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  )
}
