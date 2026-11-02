function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`)
  return value
}

const repo = required('GITHUB_REPO')
const [owner, name] = repo.split('/')
if (!owner || !name) throw new Error('GITHUB_REPO must look like owner/repo')

export const env = {
  clientId: required('GITHUB_CLIENT_ID'),
  clientSecret: required('GITHUB_CLIENT_SECRET'),
  sessionSecret: required('SESSION_SECRET'),
  owner,
  repo: name,
  baseBranch: process.env.BASE_BRANCH ?? 'main',
  localesDir: (process.env.LOCALES_DIR ?? 'locales').replace(/^\/+|\/+$/g, ''),
  sourceLocale: process.env.SOURCE_LOCALE ?? 'en',
  port: Number(process.env.PORT ?? 8787),
  appUrl: (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
  isProduction: process.env.NODE_ENV === 'production',
  /** Branch prefix used for every PR this tool creates. */
  branchPrefix: 'i18n/',
}
