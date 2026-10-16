import { loginWithFirebase, usesFirebase } from '@/auth/firebase'

const refreshKey = 'pf.refresh'
const accessKey = 'pf.access'

interface SessionResponse {
  accessToken: string
  refreshToken: string
  expiresAt: string
}

let refreshing: Promise<boolean> | null = null

export function hasRefreshToken() {
  return Boolean(localStorage.getItem(refreshKey))
}

export function clearSession() {
  localStorage.removeItem(refreshKey)
  localStorage.removeItem(accessKey)
}

function saveSession(session: SessionResponse) {
  localStorage.setItem(accessKey, session.accessToken)
  localStorage.setItem(refreshKey, session.refreshToken)
}

export async function login(username: string, password: string) {
  if (usesFirebase()) {
    await loginWithFirebase(username, password)
    return
  }
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.')
  saveSession(data as SessionResponse)
}

export function refreshSession() {
  if (!refreshing) refreshing = renew().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function renew() {
  const refreshToken = localStorage.getItem(refreshKey)
  if (!refreshToken) return false
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
  const data = (await response.json().catch(() => ({}))) as SessionResponse & { error?: string }
  if (!response.ok || !data.accessToken || !data.refreshToken) {
    clearSession()
    return false
  }
  saveSession(data)
  return true
}

export async function authFetch(input: string, init: RequestInit = {}) {
  const response = await fetch(input, { ...init, headers: withAccess(init.headers) })
  if (response.status !== 401) return response
  const renewed = await refreshSession()
  if (!renewed) return response
  return fetch(input, { ...init, headers: withAccess(init.headers) })
}

function withAccess(headers: HeadersInit | undefined) {
  const next = new Headers(headers)
  const accessToken = localStorage.getItem(accessKey)
  if (accessToken) next.set('Authorization', `Bearer ${accessToken}`)
  return next
}
