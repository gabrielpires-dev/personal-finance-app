import { useState, type FormEvent } from 'react'
import { login } from '@/auth/api'
import { Button } from '@/components/ui/button'
import { Field, TextInput } from '@/components/ui/field'

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      onSuccess()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível entrar.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4 py-10">
      <form onSubmit={(event) => void onSubmit(event)} className="w-full rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <img src="/profile.jpg" alt="" className="h-12 w-12 rounded-full object-cover" />
          <div>
            <h1 className="text-2xl font-semibold">Personal Finance</h1>
            <p className="text-sm text-muted-foreground">Entre para abrir os lançamentos do servidor.</p>
          </div>
        </div>
        <div className="space-y-4">
          <Field label="Usuário">
            <TextInput
              name="username"
              autoComplete="username"
              inputMode="numeric"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </Field>
          <Field label="Senha">
            <TextInput
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          {error ? (
            <p className="rounded-2xl bg-[#f8e8e8] px-4 py-3 text-sm text-expense" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Entrando...' : 'Entrar'}
          </Button>
        </div>
      </form>
    </main>
  )
}
