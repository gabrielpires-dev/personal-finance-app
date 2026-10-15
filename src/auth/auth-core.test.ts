import { describe, expect, it } from 'vitest'
import { SESSION_MS, authorize, emptyAuthState, login, refresh } from '../../api/src/auth-core.js'
import { USERNAME } from '../../api/src/auth-user.js'

async function tokenHash(refreshToken: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(refreshToken)))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function sessionState(refreshToken: string, now: number) {
  const state = emptyAuthState()
  return { ...state, sessions: [{ hash: await tokenHash(refreshToken), expiresAt: now + SESSION_MS }] }
}

describe('sessão', () => {
  it('bloqueia na terceira senha errada e mantém o bloqueio', () => {
    let state = emptyAuthState()
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = login(state, USERNAME, 'senha-errada', 1_000)
      expect(result.status).toBe(401)
      state = result.state
      expect(state.locked).toBe(false)
    }
    const blocked = login(state, USERNAME, 'senha-errada', 2_000)
    expect(blocked.status).toBe(423)
    expect(blocked.state.locked).toBe(true)
    const again = login(blocked.state, USERNAME, 'outra-senha', 3_000)
    expect(again.status).toBe(423)
    expect(again.state.locked).toBe(true)
  })

  it('renova a sessão por mais um mês a cada refresh', async () => {
    const now = 10_000
    const renewed = refresh(await sessionState('token-do-aparelho', now), 'token-do-aparelho', now + 86_400_000)
    expect(renewed.status).toBe(200)
    expect(renewed.state.sessions[0]?.expiresAt).toBe(now + 86_400_000 + SESSION_MS)
    const gate = authorize(renewed.state, `Bearer ${renewed.body?.accessToken}`, now + 86_400_000)
    expect(gate.ok).toBe(true)
  })

  it('recusa refresh depois de um mês sem uso', async () => {
    const now = 10_000
    const expired = refresh(await sessionState('token-do-aparelho', now), 'token-do-aparelho', now + SESSION_MS + 1)
    expect(expired.status).toBe(401)
  })
})