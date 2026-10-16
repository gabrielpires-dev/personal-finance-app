import { useEffect, useState, type ReactNode } from 'react'
import { hasRefreshToken, refreshSession } from '@/auth/api'
import { usesFirebase, watchSession } from '@/auth/firebase'
import { LoginPage } from '@/pages/LoginPage'

export function AuthGate({ children }: { children: ReactNode }) {
  const firebase = usesFirebase()
  const [status, setStatus] = useState<'loading' | 'anonymous' | 'authenticated'>(firebase || hasRefreshToken() ? 'loading' : 'anonymous')

  useEffect(() => {
    if (!firebase) return
    return watchSession((signedIn) => setStatus(signedIn ? 'authenticated' : 'anonymous'))
  }, [firebase])

  useEffect(() => {
    if (firebase || status !== 'loading') return
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
  }, [firebase, status])

  if (status === 'loading') return <p className="p-6 text-sm text-muted-foreground">Carregando sessão...</p>
  if (status === 'anonymous') return <LoginPage onSuccess={() => setStatus('authenticated')} />
  return children
}
