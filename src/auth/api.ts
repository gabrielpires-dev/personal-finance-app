import config from '@/data/config.json'

const refreshKey = 'pf.refresh'
const accessKey = 'pf.access'
const driveUrl = config.financeApiUrl.trim()

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
  if (driveUrl) {
    const data = await drivePost({ action: 'login', username, password })
    saveSession(data as SessionResponse)
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
  if (driveUrl) {
    try {
      const data = await drivePost({ action: 'refresh', refreshToken })
      if (!data.accessToken || !data.refreshToken) {
        clearSession()
        return false
      }
      saveSession(data as SessionResponse)
      return true
    } catch {
      clearSession()
      return false
    }
  }
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
  if (driveUrl && input.endsWith('/api/finance')) return driveFinance(init, true)
  const response = await fetch(input, { ...init, headers: withAccess(init.headers) })
  if (response.status !== 401) return response
  const renewed = await refreshSession()
  if (!renewed) return response
  return fetch(input, { ...init, headers: withAccess(init.headers) })
}

interface DriveResult {
  ok?: boolean
  pending?: boolean
  status?: number
  error?: string
  data?: unknown
  accessToken?: string
  refreshToken?: string
  expiresAt?: string
}

async function driveFinance(init: RequestInit, allowRefresh: boolean): Promise<Response> {
  const accessToken = localStorage.getItem(accessKey) ?? ''
  const action = init.method === 'PUT' ? 'put' : 'get'
  const payload: Record<string, unknown> = { action, accessToken }
  if (action === 'put') payload.data = JSON.parse(String(init.body ?? '{}'))
  try {
    const data = await callDrive(payload)
    if (data.status === 401 && allowRefresh) {
      const renewed = await refreshSession()
      if (renewed) return driveFinance(init, false)
    }
    return new Response(JSON.stringify(action === 'get' ? data.data : { ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao acessar o arquivo.'
    const status = message.includes('Sessão expirada') ? 401 : 400
    return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
}

async function drivePost(body: Record<string, unknown>) {
  const data = await callDrive(body)
  if (!data.accessToken || !data.refreshToken) throw new Error(data.error || 'Não foi possível entrar.')
  return data
}

async function callDrive(body: Record<string, unknown>) {
  const response = await fetch('/api/drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (text.includes('Script function not found')) {
    throw new Error('Publique uma nova versão do Apps Script. A versão no ar ainda não tem o código do arquivo.')
  }
  let data: DriveResult
  try {
    data = JSON.parse(text) as DriveResult
  } catch {
    throw new Error('O Drive não respondeu com JSON.')
  }
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Não foi possível entrar.')
  return data
}

function withAccess(headers: HeadersInit | undefined) {
  const next = new Headers(headers)
  const accessToken = localStorage.getItem(accessKey)
  if (accessToken) next.set('Authorization', `Bearer ${accessToken}`)
  return next
}
