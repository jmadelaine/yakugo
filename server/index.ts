import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { api } from './api'
import { auth } from './auth'
import { env } from './env'
import { HttpError } from './errors'

const app = new Hono()

app.use(logger())
app.route('/auth', auth)
app.route('/api', api)

app.onError((error, c) => {
  if (error instanceof HttpError) return c.json({ error: error.message }, error.status as 400)
  // Octokit errors carry the GitHub status code.
  const githubStatus = (error as unknown as { status?: unknown }).status
  const status = typeof githubStatus === 'number' && githubStatus >= 400 && githubStatus < 600 ? githubStatus : 500
  console.error(error)
  return c.json({ error: error.message || 'Unexpected error' }, status as 500)
})

if (env.isProduction) {
  app.use('*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ root: './dist', path: 'index.html' }))
}

serve({ fetch: app.fetch, port: env.port }, () => {
  const source = env.localDataDir ? `local folder ${env.localDataDir}` : `repo ${env.owner}/${env.repo}`
  console.log(`API listening on http://localhost:${env.port} (${source}, base ${env.baseBranch})`)
})
