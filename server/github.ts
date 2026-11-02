import { Octokit } from 'octokit'
import { diffTranslations, parseTranslationFile, serializeTranslationFile, slugify } from '../shared/translations'
import type {
  FlatTranslations,
  LocaleFile,
  PullRequestDetail,
  PullRequestSummary,
  TranslationSnapshot,
} from '../shared/types'
import { env } from './env'

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const repo = { owner: env.owner, repo: env.repo }

export function createClient(token: string): Octokit {
  return new Octokit({ auth: token })
}

function localeFromPath(path: string): string | undefined {
  const match = /^(.+)\.json$/.exec(path.split('/').pop() ?? '')
  return match?.[1]
}

function isTranslationFile(path: string): boolean {
  return path.startsWith(`${env.localesDir}/`) && localeFromPath(path) !== undefined
}

async function readBlobText(octokit: Octokit, sha: string): Promise<string> {
  const { data } = await octokit.rest.git.getBlob({ ...repo, file_sha: sha })
  return Buffer.from(data.content, 'base64').toString('utf8')
}

/** Reads every <locale>.json in the locales directory at the given ref. */
export async function readLocaleFiles(octokit: Octokit, ref: string): Promise<LocaleFile[]> {
  let entries: { name: string; path: string; sha: string; type: string }[]
  try {
    const { data } = await octokit.rest.repos.getContent({ ...repo, path: env.localesDir, ref })
    if (!Array.isArray(data)) throw new HttpError(500, `${env.localesDir} is not a directory`)
    entries = data
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }

  const files = entries.filter((entry) => entry.type === 'file' && localeFromPath(entry.name))
  return Promise.all(
    files.map(async (file): Promise<LocaleFile> => {
      const text = await readBlobText(octokit, file.sha)
      let parsed
      try {
        parsed = parseTranslationFile(text)
      } catch (error) {
        throw new HttpError(500, `Could not parse ${file.path}: ${(error as Error).message}`)
      }
      return { locale: localeFromPath(file.name)!, path: file.path, ...parsed }
    }),
  )
}

function sortLocales(files: LocaleFile[]): LocaleFile[] {
  return [...files].sort((a, b) => {
    if (a.locale === env.sourceLocale) return -1
    if (b.locale === env.sourceLocale) return 1
    return a.locale.localeCompare(b.locale)
  })
}

export async function getBranchHead(octokit: Octokit, branch: string): Promise<string> {
  try {
    const { data } = await octokit.rest.git.getRef({ ...repo, ref: `heads/${branch}` })
    return data.object.sha
  } catch (error) {
    if (isNotFound(error)) throw new HttpError(404, `Branch ${branch} not found`)
    throw error
  }
}

export async function getSnapshot(octokit: Octokit, branch: string): Promise<TranslationSnapshot> {
  const headSha = await getBranchHead(octokit, branch)
  const locales = sortLocales(await readLocaleFiles(octokit, headSha))
  return { repo: `${env.owner}/${env.repo}`, branch, headSha, sourceLocale: env.sourceLocale, locales }
}

function toFlatMap(files: LocaleFile[]): Record<string, FlatTranslations> {
  return Object.fromEntries(files.map((file) => [file.locale, file.entries]))
}

interface CommitResult {
  sha: string
  changedFiles: string[]
}

/**
 * Writes the given locale contents to `branch` as one commit.
 * Only files whose content differs are included. Fails when the branch moved
 * since the client loaded it.
 */
export async function commitTranslations(
  octokit: Octokit,
  branch: string,
  expectedHeadSha: string,
  locales: Record<string, FlatTranslations>,
  message: string,
): Promise<CommitResult> {
  const headSha = await getBranchHead(octokit, branch)
  if (headSha !== expectedHeadSha) {
    throw new HttpError(409, 'The branch changed since you loaded it. Reload and apply your edits again.')
  }

  const current = await readLocaleFiles(octokit, headSha)
  const currentByLocale = new Map(current.map((file) => [file.locale, file]))

  const treeEntries: { path: string; mode: '100644'; type: 'blob'; content: string }[] = []
  for (const [locale, entries] of Object.entries(locales)) {
    if (!/^[\w-]+$/.test(locale)) throw new HttpError(400, `Invalid locale name: ${locale}`)
    const existing = currentByLocale.get(locale)
    const nested = existing?.nested ?? true
    const content = serializeTranslationFile(entries, nested)
    const before = existing ? serializeTranslationFile(existing.entries, existing.nested) : undefined
    if (content !== before) {
      treeEntries.push({ path: existing?.path ?? `${env.localesDir}/${locale}.json`, mode: '100644', type: 'blob', content })
    }
  }
  if (treeEntries.length === 0) throw new HttpError(400, 'No translation changes to commit')

  const { data: headCommit } = await octokit.rest.git.getCommit({ ...repo, commit_sha: headSha })
  const { data: tree } = await octokit.rest.git.createTree({ ...repo, base_tree: headCommit.tree.sha, tree: treeEntries })
  const { data: commit } = await octokit.rest.git.createCommit({ ...repo, message, tree: tree.sha, parents: [headSha] })
  await octokit.rest.git.updateRef({ ...repo, ref: `heads/${branch}`, sha: commit.sha })
  return { sha: commit.sha, changedFiles: treeEntries.map((entry) => entry.path) }
}

export async function proposeChanges(
  octokit: Octokit,
  login: string,
  title: string,
  description: string,
  expectedHeadSha: string,
  locales: Record<string, FlatTranslations>,
): Promise<PullRequestSummary> {
  const branch = `${env.branchPrefix}${slugify(login)}/${slugify(title)}-${Date.now().toString(36)}`
  await octokit.rest.git.createRef({ ...repo, ref: `refs/heads/${branch}`, sha: expectedHeadSha })
  try {
    await commitTranslations(octokit, branch, expectedHeadSha, locales, title)
  } catch (error) {
    await octokit.rest.git.deleteRef({ ...repo, ref: `heads/${branch}` }).catch(() => undefined)
    throw error
  }
  const { data: pr } = await octokit.rest.pulls.create({
    ...repo,
    title,
    body: description,
    head: branch,
    base: env.baseBranch,
  })
  return toSummary(pr)
}

type PullData = Awaited<ReturnType<Octokit['rest']['pulls']['get']>>['data']
type PullListItem = Awaited<ReturnType<Octokit['rest']['pulls']['list']>>['data'][number]

function toSummary(pr: PullData | PullListItem): PullRequestSummary {
  return {
    number: pr.number,
    title: pr.title,
    author: pr.user?.login ?? 'unknown',
    authorAvatar: pr.user?.avatar_url ?? '',
    branch: pr.head.ref,
    draft: pr.draft ?? false,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    url: pr.html_url,
  }
}

/** Open PRs created by this tool (branch prefix match). */
export async function listTranslationPulls(octokit: Octokit): Promise<PullRequestSummary[]> {
  const pulls = await octokit.paginate(octokit.rest.pulls.list, {
    ...repo,
    state: 'open',
    base: env.baseBranch,
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
  })
  return pulls.filter((pr) => pr.head.ref.startsWith(env.branchPrefix)).map(toSummary)
}

export async function getPullDetail(octokit: Octokit, number: number): Promise<PullRequestDetail> {
  let pr: PullData
  try {
    pr = (await octokit.rest.pulls.get({ ...repo, pull_number: number })).data
  } catch (error) {
    if (isNotFound(error)) throw new HttpError(404, `Pull request #${number} not found`)
    throw error
  }

  // Compare against the merge base, so changes made on the base branch after
  // the PR was opened do not show up as reverts.
  const { data: comparison } = await octokit.rest.repos.compareCommitsWithBasehead({
    ...repo,
    basehead: `${pr.base.sha}...${pr.head.sha}`,
  })
  const mergeBaseSha = comparison.merge_base_commit.sha

  const [before, after, files] = await Promise.all([
    readLocaleFiles(octokit, mergeBaseSha),
    readLocaleFiles(octokit, pr.head.sha),
    octokit.paginate(octokit.rest.pulls.listFiles, { ...repo, pull_number: number, per_page: 100 }),
  ])

  return {
    ...toSummary(pr),
    body: pr.body ?? '',
    state: pr.state as 'open' | 'closed',
    merged: pr.merged,
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    changes: diffTranslations(toFlatMap(before), toFlatMap(after)),
    otherFiles: files.map((file) => file.filename).filter((path) => !isTranslationFile(path)),
  }
}

export async function mergePull(octokit: Octokit, number: number): Promise<void> {
  const { data: pr } = await octokit.rest.pulls.get({ ...repo, pull_number: number })
  try {
    await octokit.rest.pulls.merge({ ...repo, pull_number: number, merge_method: 'squash' })
  } catch (error) {
    throw new HttpError(409, `GitHub refused the merge: ${(error as Error).message}`)
  }
  if (pr.head.repo?.full_name === `${env.owner}/${env.repo}`) {
    await octokit.rest.git.deleteRef({ ...repo, ref: `heads/${pr.head.ref}` }).catch(() => undefined)
  }
}

export async function closePull(octokit: Octokit, number: number): Promise<void> {
  await octokit.rest.pulls.update({ ...repo, pull_number: number, state: 'closed' })
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 404
}
