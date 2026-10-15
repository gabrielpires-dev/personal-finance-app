import { useEffect, useState, type ReactNode } from 'react'
import { hasRefreshToken, refreshSession } from '@/auth/api'
import { LoginPage } from '@/pages/LoginPage'

export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'anonymous' | 'authenticated'>(hasRefreshToken() ? 'loading' : 'anonymous')

  useEffect(() => {
    if (status !== 'loading') return
    let active = true
    refreshSession()
      .then((ok) => {
        if (active) setStatus(ok ? 'authenticated' : 'anonymous')
      })
      .catch(() => {
        if (active) setStatus('anonymous')
      })
    return () => {
      active = false
    }
  }, [status])

  if (status === 'loading') return <p className="p-6 text-sm text-muted-foreground">Carregando sessão...</p>
  if (status === 'anonymous') return <LoginPage onSuccess={() => setStatus('authenticated')} />
  return children
}
