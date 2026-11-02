import { userInfo } from 'node:os'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`)
  return value
}

/**
 * With LOCAL_DATA_DIR set, translations are read from and written to that
 * folder on disk and GitHub is never contacted. Sign-in then needs no OAuth app.
 */
const localDataDir = process.env.LOCAL_DATA_DIR?.replace(/\/+$/, '') || undefined

const repo = localDataDir ? `local/${localDataDir.split('/').pop() ?? localDataDir}` : required('GITHUB_REPO')
const [owner, name] = repo.split('/')
if (!owner || !name) throw new Error('GITHUB_REPO must look like owner/repo')

export const env = {
  localDataDir,
  localUser: process.env.LOCAL_USER || userInfo().username,
  clientId: localDataDir ? '' : required('GITHUB_CLIENT_ID'),
  clientSecret: localDataDir ? '' : required('GITHUB_CLIENT_SECRET'),
  sessionSecret: process.env.SESSION_SECRET || (localDataDir ? 'local-dev-session-secret' : required('SESSION_SECRET')),
  owner,
  repo: name,
  baseBranch: process.env.BASE_BRANCH ?? 'main',
  /** Project folder and reference locale used when the repo has no yakugo.yaml. */
  localesDir: (process.env.LOCALES_DIR ?? 'locales').replace(/^\/+|\/+$/g, ''),
  sourceLocale: process.env.SOURCE_LOCALE ?? 'en',
  port: Number(process.env.PORT ?? 8787),
  appUrl: (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
  isProduction: process.env.NODE_ENV === 'production',
  /** Branch prefix used for every PR this tool creates. */
  branchPrefix: 'i18n/',
}
