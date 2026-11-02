import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { Octokit } from 'octokit'
import { env } from './env'
import { clearSession, setSession } from './session'

const STATE_COOKIE = 'oauth_state'

export const auth = new Hono()

auth.get('/login', (c) => {
  if (env.localDataDir) {
    const login = env.localUser
    setSession(c, { token: '', login, name: null, avatarUrl: `https://github.com/identicons/${login}.png` })
    return c.redirect(env.appUrl)
  }
  const state = randomBytes(16).toString('hex')
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, sameSite: 'Lax', secure: env.isProduction, path: '/', maxAge: 600 })
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: `${env.appUrl}/auth/callback`,
    scope: 'repo read:user',
    state,
  })
  return c.redirect(`https://github.com/login/oauth/authorize?${params}`)
})

auth.get('/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const expectedState = getCookie(c, STATE_COOKIE)
  deleteCookie(c, STATE_COOKIE, { path: '/' })
  if (!code || !state || state !== expectedState) {
    return c.text('Invalid OAuth state. Please try logging in again.', 400)
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.clientId, client_secret: env.clientSecret, code }),
  })
  const data = (await response.json()) as { access_token?: string; error_description?: string }
  if (!data.access_token) {
    return c.text(`GitHub login failed: ${data.error_description ?? 'no token returned'}`, 400)
  }

  const octokit = new Octokit({ auth: data.access_token })
  const { data: user } = await octokit.rest.users.getAuthenticated()
  setSession(c, { token: data.access_token, login: user.login, name: user.name, avatarUrl: user.avatar_url })
  return c.redirect(env.appUrl)
})

auth.post('/logout', (c) => {
  clearSession(c)
  return c.json({ ok: true })
})
