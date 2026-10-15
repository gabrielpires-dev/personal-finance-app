import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { USERNAME, passwordMatches } from './auth-user.js'

export const SESSION_MS = 30 * 24 * 60 * 60 * 1000
export const LOCK_MESSAGE = 'Acesso bloqueado após 3 tentativas de senha.'
const INVALID_MESSAGE = 'Usuário ou senha inválidos.'
const EXPIRED_MESSAGE = 'Sessão expirada. Entre novamente.'

export function emptyAuthState() {
  return {
    secret: randomBytes(32).toString('base64url'),
    failedAttempts: 0,
    locked: false,
    sessions: [],
  }
}

export function normalizeState(value) {
  if (!value || typeof value !== 'object' || typeof value.secret !== 'string' || !value.secret) return emptyAuthState()
  const sessions = Array.isArray(value.sessions)
    ? value.sessions.filter((session) => session && typeof session.hash === 'string' && Number.isFinite(session.expiresAt))
    : []
  return {
    secret: value.secret,
    failedAttempts: Number.isInteger(value.failedAttempts) && value.failedAttempts > 0 ? value.failedAttempts : 0,
    locked: value.locked === true,
    sessions,
  }
}

export function login(state, username, password, now = Date.now()) {
  const next = normalizeState(state)
  if (next.locked) return { state: next, status: 423, error: LOCK_MESSAGE }
  const accepted = String(username ?? '').trim() === USERNAME && passwordMatches(password)
  if (!accepted) {
    next.failedAttempts += 1
    if (next.failedAttempts >= 3) next.locked = true
    return { state: next, status: next.locked ? 423 : 401, error: next.locked ? LOCK_MESSAGE : INVALID_MESSAGE }
  }
  next.failedAttempts = 0
  const issued = issueSession(next, now)
  return { state: issued.state, status: 200, body: issued.body }
}

export function refresh(state, refreshToken, now = Date.now()) {
  const next = normalizeState(state)
  const active = next.sessions.filter((session) => session.expiresAt > now)
  const hash = tokenHash(refreshToken)
  const current = active.find((session) => hashesEqual(session.hash, hash))
  if (!current) return { state: { ...next, sessions: active }, status: 401, error: EXPIRED_MESSAGE }
  const issued = issueSession({ ...next, sessions: active.filter((session) => session !== current) }, now)
  return { state: issued.state, status: 200, body: issued.body }
}

export function authorize(state, authorization, now = Date.now()) {
  const token = bearer(authorization)
  if (!token) return { ok: false }
  const payload = verifyAccessToken(normalizeState(state).secret, token, now)
  if (!payload) return { ok: false }
  return { ok: true, username: payload.sub }
}

function issueSession(state, now) {
  const refreshToken = randomBytes(32).toString('base64url')
  const sessions = state.sessions.filter((session) => session.expiresAt > now)
  sessions.push({ hash: tokenHash(refreshToken), expiresAt: now + SESSION_MS })
  const access = signAccessToken(state.secret, now)
  return {
    state: { ...state, sessions: sessions.slice(-10) },
    body: {
      accessToken: access.token,
      refreshToken,
      expiresAt: new Date(now + SESSION_MS).toISOString(),
    },
  }
}

function signAccessToken(secret, now) {
  const payload = { sub: USERNAME, exp: now + SESSION_MS }
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return { token: `${body}.${signature}` }
}

function verifyAccessToken(secret, token, now) {
  const parts = String(token).split('.')
  if (parts.length !== 3) return null
  const [header, payload, signature] = parts
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  if (!hashesEqual(signature, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data || data.sub !== USERNAME || typeof data.exp !== 'number' || data.exp <= now) return null
    return data
  } catch {
    return null
  }
}

function bearer(authorization) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(authorization ?? ''))
  return match?.[1] ?? ''
}

function tokenHash(token) {
  return createHash('sha256').update(String(token ?? '')).digest('base64url')
}

function hashesEqual(left, right) {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}
