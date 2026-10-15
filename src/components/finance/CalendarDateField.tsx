import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { competenceLabel } from '@/components/finance/CompetenceSwitcher'
import { maskDate, parseBrDate } from '@/components/finance/DateInput'
import { dateISO, daysInMonth, formatDateBR, shiftCompetence, todayISO } from '@/domain/dates'
import { cn } from '@/lib/cn'

const weekdays = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
const panelWidth = 320
const panelHeight = 384

export function CalendarDateField({
  value,
  onChange,
  minDate,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  minDate?: string
  'aria-label': string
}) {
  const labelId = useId()
  const fieldRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => (parseBrDate(value) ?? minDate ?? todayISO()).slice(0, 7))
  const [box, setBox] = useState({ top: 0, left: 0, width: panelWidth })

  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const rect = fieldRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(panelWidth, window.innerWidth - 16)
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
      const below = rect.bottom + 8
      const top = below + panelHeight > window.innerHeight - 8 ? Math.max(8, rect.top - panelHeight - 8) : below
      setBox({ top, left, width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (fieldRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
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

  const minMonth = minDate?.slice(0, 7)
  const maxMonth = shiftCompetence(minMonth ?? todayISO().slice(0, 7), 96)
  const year = Number(view.slice(0, 4))
  const monthNumber = Number(view.slice(5))
  const selected = parseBrDate(value)
  const today = todayISO()
  const leading = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7
  const dayCount = daysInMonth(year, monthNumber)
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - leading + 1
    return day >= 1 && day <= dayCount ? dateISO(year, monthNumber, day) : null
  })

  function openCalendar() {
    setView((parseBrDate(value) ?? minDate ?? todayISO()).slice(0, 7))
    setOpen(true)
  }

  return (
    <>
      <div ref={fieldRef} className="relative">
        <input
          value={value}
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/aaaa"
          maxLength={10}
          aria-label={ariaLabel}
          className="h-12 w-full rounded-xl border border-border bg-white px-3 pr-12 text-base outline-none focus:border-primary"
          onChange={(event) => onChange(maskDate(event.target.value))}
        />
        <button
          type="button"
          aria-label="Abrir calendário"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openCalendar())}
          className="absolute top-1 right-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Calendar className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-labelledby={labelId}
              className="fixed z-50 rounded-2xl border border-border bg-card p-3 shadow-lg"
              style={{ top: box.top, left: box.left, width: box.width, height: panelHeight }}
            >
              <div className="mb-2 flex h-9 items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label="Mês anterior"
                  disabled={Boolean(minMonth && view <= minMonth)}
                  onClick={() => setView((current) => shiftCompetence(current, -1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-foreground hover:bg-secondary disabled:opacity-30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <p id={labelId} className="text-sm font-semibold">
                  {competenceLabel(view)}
                </p>
                <button
                  type="button"
                  aria-label="Próximo mês"
                  disabled={view >= maxMonth}
                  onClick={() => setView((current) => shiftCompetence(current, 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-foreground hover:bg-secondary disabled:opacity-30"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              <div className="grid h-8 grid-cols-7 items-center text-center text-xs font-medium text-muted-foreground">
                {weekdays.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>
              <div className="mt-1 grid h-[236px] grid-cols-7 grid-rows-6 gap-1">
                {cells.map((iso, index) => {
                  if (!iso) return <span key={`empty-${index}`} />
                  const disabled = Boolean(minDate && iso < minDate)
                  const day = Number(iso.slice(8))
                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={disabled}
                      aria-label={formatDateBR(iso)}
                      aria-pressed={iso === selected}
                      onClick={() => {
                        onChange(formatDateBR(iso))
                        setOpen(false)
                      }}
                      className={cn(
                        'rounded-lg text-sm tabular',
                        iso === selected && 'bg-primary font-semibold text-white',
                        iso !== selected && iso === today && 'ring-1 ring-primary',
                        iso !== selected && !disabled && 'hover:bg-secondary',
                        disabled && 'text-muted-foreground/40',
                      )}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className="mt-2 h-9 w-full rounded-xl text-sm font-semibold text-income hover:bg-secondary"
              >
                Não encerrar
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
