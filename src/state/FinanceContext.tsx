import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { currentCompetence, isCompetence } from '@/domain/dates'
import type { FinanceSnapshot } from '@/db/finance-repository'
import * as finance from '@/db/finance-repository'

interface FinanceContextValue {
  loading: boolean
  error: string | null
  notice: string | null
  snapshot: FinanceSnapshot | null
  competence: string
  setCompetence: (competence: string) => void
  reload: () => Promise<void>
  mutate: <T>(action: () => Promise<T>, success?: string) => Promise<T>
}

const FinanceContext = createContext<FinanceContextValue | null>(null)

export function FinanceProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const monthRoute = location.pathname === '/' || location.pathname === '/mes'
  const requested = monthRoute ? params.get('c') : null
  const urlCompetence = requested && isCompetence(requested) ? requested : null
  const [heldCompetence, setHeldCompetence] = useState<string | null>(urlCompetence)
  if (urlCompetence && heldCompetence !== urlCompetence) setHeldCompetence(urlCompetence)
  const competence = urlCompetence ?? heldCompetence ?? currentCompetence()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null)
  const locationRef = useRef(location)
  const navigateRef = useRef(navigate)
  locationRef.current = location
  navigateRef.current = navigate

  function goToCompetence(nextCompetence: string, replace = false) {
    const next = new URLSearchParams(locationRef.current.search)
    next.set('c', nextCompetence)
    navigateRef.current(
      { pathname: locationRef.current.pathname, search: next.toString() },
      { replace },
    )
  }

  async function reload() {
    const data = await finance.loadFinance(competence)
    setSnapshot(data)
    const path = locationRef.current.pathname
    const onMonthRoute = path === '/' || path === '/mes'
    const currentQuery = new URLSearchParams(locationRef.current.search).get('c')
    if (onMonthRoute && (!currentQuery || !isCompetence(currentQuery))) {
      const favorite = data.settings.favoriteCompetence
      const preferred = favorite && isCompetence(favorite) ? favorite : data.settings.lastCompetence
      if (preferred && isCompetence(preferred) && preferred !== competence) {
        goToCompetence(preferred, true)
      }
    }
  }

  useEffect(() => {
    if (location.pathname !== '/novo' || !location.search) return
    navigate({ pathname: '/novo' }, { replace: true })
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    reload()
      .catch((reason: unknown) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o banco do servidor.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [competence])

  function setCompetence(nextCompetence: string) {
    goToCompetence(nextCompetence)
    void finance.rememberCompetence(nextCompetence)
  }

  async function mutate<T>(action: () => Promise<T>, success?: string) {
    setError(null)
    const result = await action()
    setSnapshot(await finance.loadFinance(competence))
    if (success) setNotice(success)
    return result
  }

  const value: FinanceContextValue = {
    loading,
    error,
    notice,
    snapshot,
    competence,
    setCompetence,
    reload,
    mutate,
  }

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
}

export function useFinance() {
  const value = useContext(FinanceContext)
  if (!value) throw new Error('useFinance fora do provedor')
  return value
}
