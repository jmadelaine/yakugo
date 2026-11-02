import { Hono } from 'hono'
import type { BranchMetaRequest, CreateBranchRequest, ProposeRequest, User, WritePayload } from '../shared/types'
import { env } from './env'
import { HttpError } from './errors'
import { getRepository, type ProjectEdit } from './repository'
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
  c.json({
    repo: `${env.owner}/${env.repo}`,
    baseBranch: env.baseBranch,
    source: env.localDataDir ? 'local' : 'github',
  }),
)

api.use('*', async (c, next) => {
  const session = getSession(c)
  if (!session) return c.json({ error: 'Not signed in' }, 401)
  c.set('session', session)
  await next()
})

api.get('/projects', async (c) => c.json(await getRepository(c.get('session')).listProjects()))

api.get('/translations', async (c) => {
  const project = c.req.query('project')
  if (!project) throw new HttpError(400, 'A project is required')
  const branch = c.req.query('branch') ?? env.baseBranch
  return c.json(await getRepository(c.get('session')).getSnapshot(project, branch))
})

api.get('/branches', async (c) => c.json(await getRepository(c.get('session')).listBranches()))

/** Stage one: start a change. Edits are saved into it afterwards. */
api.post('/branches', async (c) => {
  const body = (await c.req.json()) as CreateBranchRequest
  if (!body.title?.trim()) throw new HttpError(400, 'A title is required')
  const session = c.get('session')
  const result = await getRepository(session).createBranch(session.login, {
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
  })
  return c.json(result, 201)
})

api.patch('/branches/:branch', async (c) => {
  const body = (await c.req.json()) as BranchMetaRequest
  if (!body.title?.trim()) throw new HttpError(400, 'A title is required')
  await getRepository(c.get('session')).updateBranchMeta(c.req.param('branch'), {
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
  })
  return c.json({ ok: true })
})

api.get('/branches/:branch', async (c) =>
  c.json(await getRepository(c.get('session')).getBranchDetail(c.req.param('branch'))),
)

api.post('/branches/:branch/commit', async (c) => {
  const body = (await c.req.json()) as WritePayload
  if (!body.project) throw new HttpError(400, 'A project is required')
  const repository = getRepository(c.get('session'))
  const branch = c.req.param('branch')
  const detail = await repository.getBranchDetail(branch)
  if (detail.pull && detail.pull.state !== 'open') throw new HttpError(400, 'This change is closed')
  const result = await repository.commitTranslations(
    body.project,
    branch,
    body.expectedHeadSha,
    toEdit(body),
    `Update translations (${detail.title})`,
  )
  return c.json(result)
})

/** Stage two: open the pull request for a draft branch. */
api.post('/branches/:branch/propose', async (c) => {
  const body = (await c.req.json()) as ProposeRequest
  if (!body.title?.trim()) throw new HttpError(400, 'A title is required')
  const pull = await getRepository(c.get('session')).openPull(c.req.param('branch'), body.title.trim(), body.description ?? '')
  return c.json(pull, 201)
})

api.delete('/branches/:branch', async (c) => {
  await getRepository(c.get('session')).deleteBranch(c.req.param('branch'))
  return c.json({ ok: true })
})

api.post('/pulls/:number/merge', async (c) => {
  await getRepository(c.get('session')).mergePull(parseNumber(c.req.param('number')))
  return c.json({ ok: true })
})

api.post('/pulls/:number/close', async (c) => {
  await getRepository(c.get('session')).closePull(parseNumber(c.req.param('number')))
  return c.json({ ok: true })
})

function toEdit(body: WritePayload): ProjectEdit {
  return {
    content: { values: body.values ?? {}, fieldValues: body.fieldValues ?? {} },
    placeholderExamples: body.placeholderExamples,
  }
}

function parseNumber(value: string): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new HttpError(400, 'Invalid pull request number')
  return number
}
