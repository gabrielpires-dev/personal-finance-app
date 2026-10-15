import { scryptSync, timingSafeEqual } from 'node:crypto'

export const USERNAME = '12213457611'
const PASSWORD_SALT = 'iHYHlo5MJfOrI3o1R0mgLA=='
const PASSWORD_HASH = '0xiBebuU9UW733CoR7bcVwIkYgeCf0gwyIkrOZO8fNQHdrnPVjvfkCmHW8Rnb4/dC0W8SqjLk4M4uYaJfYsGjw=='

export function passwordMatches(password) {
  const actual = scryptSync(String(password ?? ''), Buffer.from(PASSWORD_SALT, 'base64'), 64)
  const expected = Buffer.from(PASSWORD_HASH, 'base64')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
