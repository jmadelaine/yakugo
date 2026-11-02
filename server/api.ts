import { Hono } from 'hono'
import type { ProposeRequest, User, WritePayload } from '../shared/types'
import { env } from './env'
import {
  closePull,
  commitTranslations,
  createClient,
  getPullDetail,
  getSnapshot,
  HttpError,
  listTranslationPulls,
  mergePull,
  proposeChanges,
} from './github'
import { getSession, type Session } from './session'

type Variables = { session: Session }

export const api = new Hono<{ Variables: Variables }>()

api.get('/me', (c) => {
  const session = getSession(c)
  if (!session) return c.json({ error: 'Not signed in' }, 401)
  const user: User = { login: session.login, name: session.name, avatarUrl: session.avatarUrl }
  return c.json(user)
})

api.get('/config', (c) =>
  c.json({ repo: `${env.owner}/${env.repo}`, baseBranch: env.baseBranch, localesDir: env.localesDir }),
)

api.use('*', async (c, next) => {
  const session = getSession(c)
  if (!session) return c.json({ error: 'Not signed in' }, 401)
  c.set('session', session)
  await next()
})

api.get('/translations', async (c) => {
  const branch = c.req.query('branch') ?? env.baseBranch
  const octokit = createClient(c.get('session').token)
  return c.json(await getSnapshot(octokit, branch))
})

api.post('/propose', async (c) => {
  const body = (await c.req.json()) as ProposeRequest
  if (!body.title?.trim()) throw new HttpError(400, 'A title is required')
  const session = c.get('session')
  const octokit = createClient(session.token)
  const pr = await proposeChanges(
    octokit,
    session.login,
    body.title.trim(),
    body.description ?? '',
    body.expectedHeadSha,
    body.locales,
  )
  return c.json(pr, 201)
})

api.get('/pulls', async (c) => {
  const octokit = createClient(c.get('session').token)
  return c.json(await listTranslationPulls(octokit))
})

api.get('/pulls/:number', async (c) => {
  const octokit = createClient(c.get('session').token)
  return c.json(await getPullDetail(octokit, parseNumber(c.req.param('number'))))
})

api.post('/pulls/:number/commit', async (c) => {
  const body = (await c.req.json()) as WritePayload & { message?: string }
  const octokit = createClient(c.get('session').token)
  const number = parseNumber(c.req.param('number'))
  const detail = await getPullDetail(octokit, number)
  if (detail.state !== 'open') throw new HttpError(400, 'Pull request is not open')
  const result = await commitTranslations(
    octokit,
    detail.branch,
    body.expectedHeadSha,
    body.locales,
    body.message?.trim() || `Update translations (#${number})`,
  )
  return c.json(result)
})

api.post('/pulls/:number/merge', async (c) => {
  const octokit = createClient(c.get('session').token)
  await mergePull(octokit, parseNumber(c.req.param('number')))
  return c.json({ ok: true })
})

api.post('/pulls/:number/close', async (c) => {
  const octokit = createClient(c.get('session').token)
  await closePull(octokit, parseNumber(c.req.param('number')))
  return c.json({ ok: true })
})

function parseNumber(value: string): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new HttpError(400, 'Invalid pull request number')
  return number
}
