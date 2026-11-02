import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { env } from './env'

export interface Session {
  token: string
  login: string
  name: string | null
  avatarUrl: string
}

const COOKIE = 'session'
const KEY = createHash('sha256').update(env.sessionSecret).digest()

/** AES-256-GCM: base64url(iv | tag | ciphertext). */
export function seal(data: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

export function unseal<T>(sealed: string): T | undefined {
  try {
    const buffer = Buffer.from(sealed, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', KEY, buffer.subarray(0, 12))
    decipher.setAuthTag(buffer.subarray(12, 28))
    const text = Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8')
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

export function getSession(c: Context): Session | undefined {
  const cookie = getCookie(c, COOKIE)
  return cookie ? unseal<Session>(cookie) : undefined
}

export function setSession(c: Context, session: Session): void {
  setCookie(c, COOKIE, seal(session), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.isProduction,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export function clearSession(c: Context): void {
  deleteCookie(c, COOKIE, { path: '/' })
}
