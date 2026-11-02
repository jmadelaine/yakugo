import { Octokit } from 'octokit'
import { CHANGE_META_FILE, parseChangeMeta, serializeChangeMeta, type ChangeMeta } from '../shared/changeMeta'
import { CONFIG_FILE, projectFiles, type ProjectConfig, type YakugoConfig } from '../shared/config'
import { decodeProject, encodeProject, type FileTexts } from '../shared/format'
import { diffProject, slugify } from '../shared/translations'
import type {
  BranchDetail,
  BranchSummary,
  ProjectSummary,
  PullRequestSummary,
  TranslationSnapshot,
} from '../shared/types'
import { env } from './env'
import { HttpError } from './errors'
import {
  assertToolBranch,
  diffConfigExamples,
  findProject,
  loadConfig,
  planConfigWrite,
  toProjectSummary,
  type CommitResult,
  type ProjectEdit,
  type Repository,
} from './repository'

const repo = { owner: env.owner, repo: env.repo }

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 404
}

function decode(project: ProjectConfig, files: FileTexts) {
  try {
    return decodeProject(project, files)
  } catch (error) {
    throw new HttpError(500, (error as Error).message)
  }
}

type PullData = Awaited<ReturnType<Octokit['rest']['pulls']['get']>>['data']
type PullListItem = Awaited<ReturnType<Octokit['rest']['pulls']['list']>>['data'][number]

function toPullSummary(pr: PullData | PullListItem): PullRequestSummary {
  const full = 'mergeable' in pr ? pr : undefined
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body ?? '',
    state: pr.state as 'open' | 'closed',
    merged: full?.merged ?? pr.merged_at !== null,
    draft: pr.draft ?? false,
    mergeable: full?.mergeable ?? null,
    mergeableState: full?.mergeable_state ?? 'unknown',
    createdAt: pr.created_at,
    url: pr.html_url,
  }
}

function firstLine(message: string): string {
  return message.split('\n')[0].trim()
}

/** Repository backed by the GitHub REST API, acting as the signed-in user. */
export function createGitHubRepository(token: string): Repository {
  const octokit = new Octokit({ auth: token })

  async function readBlob(sha: string): Promise<string> {
    const { data } = await octokit.rest.git.getBlob({ ...repo, file_sha: sha })
    return Buffer.from(data.content, 'base64').toString('utf8')
  }

  /** Text of one file at `ref`, or undefined when it does not exist. */
  async function readFileText(path: string, ref: string): Promise<string | undefined> {
    try {
      const { data } = await octokit.rest.repos.getContent({ ...repo, path, ref })
      if (Array.isArray(data) || data.type !== 'file') return undefined
      if (data.encoding === 'base64' && data.content) return Buffer.from(data.content, 'base64').toString('utf8')
      return readBlob(data.sha)
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
  }

  async function readConfigText(ref: string): Promise<string | undefined> {
    return readFileText(CONFIG_FILE, ref)
  }

  async function readConfig(ref: string): Promise<YakugoConfig> {
    return loadConfig(await readConfigText(ref))
  }

  /** Texts of every file of `project` at the given ref, keyed by repo path. */
  async function readProjectFiles(project: ProjectConfig, ref: string): Promise<FileTexts> {
    const location = projectFiles(project)
    const files: FileTexts = {}
    if (location.kind === 'single') {
      const text = await readFileText(location.path, ref)
      if (text !== undefined) files[location.path] = text
      return files
    }

    const { pattern } = location
    let entries: { name: string; path: string; sha: string; type: string }[]
    try {
      const { data } = await octokit.rest.repos.getContent({ ...repo, path: pattern.dir, ref })
      if (!Array.isArray(data)) throw new HttpError(500, `${pattern.dir || '/'} is not a directory`)
      entries = data
    } catch (error) {
      if (isNotFound(error)) return files
      throw error
    }
    for (const entry of entries) {
      if (!pattern.localeFromEntry(entry.name)) continue
      if (pattern.suffix === '') {
        if (entry.type === 'file') files[entry.path] = await readBlob(entry.sha)
      } else if (entry.type === 'dir') {
        const path = `${entry.path}/${pattern.suffix}`
        const text = await readFileText(path, ref)
        if (text !== undefined) files[path] = text
      }
    }
    return files
  }

  async function getBranchHead(branch: string): Promise<string> {
    try {
      const { data } = await octokit.rest.git.getRef({ ...repo, ref: `heads/${branch}` })
      return data.object.sha
    } catch (error) {
      if (isNotFound(error)) throw new HttpError(404, `Branch ${branch} not found`)
      throw error
    }
  }

  async function listProjects(): Promise<ProjectSummary[]> {
    const config = await readConfig(env.baseBranch)
    return config.projects.map(toProjectSummary)
  }

  async function getSnapshot(projectId: string, branch: string): Promise<TranslationSnapshot> {
    const headSha = await getBranchHead(branch)
    const project = findProject(await readConfig(headSha), projectId)
    const data = decode(project, await readProjectFiles(project, headSha))
    return { repo: `${env.owner}/${env.repo}`, project: toProjectSummary(project), branch, headSha, data }
  }

  /** Open PRs created by this tool, keyed by head branch. */
  async function openPullsByBranch(): Promise<Map<string, PullListItem>> {
    const pulls = await octokit.paginate(octokit.rest.pulls.list, {
      ...repo,
      state: 'open',
      base: env.baseBranch,
      per_page: 100,
    })
    return new Map(pulls.filter((pr) => pr.head.ref.startsWith(env.branchPrefix)).map((pr) => [pr.head.ref, pr]))
  }

  /**
   * The PR that defines a branch's state: the open one, else a merged one.
   * A closed, unmerged PR is a withdrawn submission, so the branch is a draft again.
   */
  async function findPull(branch: string): Promise<PullData | undefined> {
    const { data: pulls } = await octokit.rest.pulls.list({
      ...repo,
      head: `${env.owner}:${branch}`,
      state: 'all',
      sort: 'created',
      direction: 'desc',
      per_page: 10,
    })
    const chosen = pulls.find((pr) => pr.state === 'open') ?? pulls.find((pr) => pr.merged_at !== null)
    if (!chosen) return undefined
    return (await octokit.rest.pulls.get({ ...repo, pull_number: chosen.number })).data
  }

  async function listBranches(): Promise<BranchSummary[]> {
    const [branches, pulls] = await Promise.all([
      octokit.paginate(octokit.rest.repos.listBranches, { ...repo, per_page: 100 }),
      openPullsByBranch(),
    ])
    const mine = branches.filter((branch) => branch.name.startsWith(env.branchPrefix))
    const summaries = await Promise.all(
      mine.map(async (branch): Promise<BranchSummary> => {
        const pull = pulls.get(branch.name)
        return { ...(await describeBranch(branch.name, pull)), pull: pull ? toPullSummary(pull) : undefined }
      }),
    )
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  interface BranchFacts {
    title: string
    description: string
    author: string
    authorAvatar: string
    updatedAt: string
    mergeBaseSha: string
    files: string[]
  }

  /**
   * Title, description, author and dates of a change. Details come from the PR
   * once proposed, before that from the details file on the branch, and as a
   * last resort from the first commit. The date is the latest commit.
   */
  async function describeBranch(branch: string, pull: PullData | PullListItem | undefined): Promise<BranchFacts & { branch: string }> {
    const { data: comparison } = await octokit.rest.repos.compareCommitsWithBasehead({
      ...repo,
      basehead: `${env.baseBranch}...${branch}`,
    })
    const first = comparison.commits[0]
    const latest = comparison.commits[comparison.commits.length - 1]
    const meta = pull ? undefined : latest ? await readChangeMeta(latest.sha) : undefined
    return {
      branch,
      title: pull?.title ?? meta?.title ?? (first ? firstLine(first.commit.message) : branch),
      description: pull?.body ?? meta?.description ?? '',
      author: pull?.user?.login ?? first?.author?.login ?? first?.commit.author?.name ?? 'unknown',
      authorAvatar: pull?.user?.avatar_url ?? first?.author?.avatar_url ?? '',
      updatedAt: pull?.updated_at ?? latest?.commit.committer?.date ?? latest?.commit.author?.date ?? '',
      mergeBaseSha: comparison.merge_base_commit.sha,
      files: (comparison.files ?? []).map((file) => file.filename),
    }
  }

  async function commitTranslations(
    projectId: string,
    branch: string,
    expectedHeadSha: string,
    edit: ProjectEdit,
    message: string,
  ): Promise<CommitResult> {
    const headSha = await getBranchHead(branch)
    if (headSha !== expectedHeadSha) {
      throw new HttpError(409, 'The branch changed since you loaded it. Reload and apply your edits again.')
    }

    const configText = await readConfigText(headSha)
    const project = findProject(loadConfig(configText), projectId)
    let writes
    try {
      writes = encodeProject(project, await readProjectFiles(project, headSha), edit.content)
    } catch (error) {
      throw new HttpError(400, (error as Error).message)
    }
    const configWrite = planConfigWrite(configText, project, edit)
    if (configWrite) writes.push(configWrite)
    if (writes.length === 0) throw new HttpError(400, 'No changes to commit')

    const tree = writes.map((write) => ({ ...write, mode: '100644' as const, type: 'blob' as const }))
    const { data: headCommit } = await octokit.rest.git.getCommit({ ...repo, commit_sha: headSha })
    const { data: newTree } = await octokit.rest.git.createTree({ ...repo, base_tree: headCommit.tree.sha, tree })
    const { data: commit } = await octokit.rest.git.createCommit({ ...repo, message, tree: newTree.sha, parents: [headSha] })
    await octokit.rest.git.updateRef({ ...repo, ref: `heads/${branch}`, sha: commit.sha })
    return { sha: commit.sha, changedFiles: writes.map((write) => write.path) }
  }

  /** Commits one tree change on top of `parentSha` and moves the branch to it. */
  async function commitTree(
    branch: string,
    parentSha: string,
    message: string,
    entries: { path: string; content?: string; sha?: null }[],
  ): Promise<string> {
    const { data: parent } = await octokit.rest.git.getCommit({ ...repo, commit_sha: parentSha })
    const tree = entries.map((entry) => ({ mode: '100644' as const, type: 'blob' as const, ...entry }))
    const { data: newTree } = await octokit.rest.git.createTree({ ...repo, base_tree: parent.tree.sha, tree })
    const { data: commit } = await octokit.rest.git.createCommit({ ...repo, message, tree: newTree.sha, parents: [parentSha] })
    await octokit.rest.git.updateRef({ ...repo, ref: `heads/${branch}`, sha: commit.sha })
    return commit.sha
  }

  async function readChangeMeta(ref: string): Promise<ChangeMeta | undefined> {
    const text = await readFileText(CHANGE_META_FILE, ref)
    return text === undefined ? undefined : parseChangeMeta(text)
  }

  async function createBranch(login: string, meta: ChangeMeta): Promise<{ branch: string }> {
    const branch = `${env.branchPrefix}${slugify(login)}/${slugify(meta.title)}-${Date.now().toString(36)}`
    const baseSha = await getBranchHead(env.baseBranch)
    await octokit.rest.git.createRef({ ...repo, ref: `refs/heads/${branch}`, sha: baseSha })
    try {
      // The details file gives the draft its name, author and date until it is proposed.
      await commitTree(branch, baseSha, meta.title, [{ path: CHANGE_META_FILE, content: serializeChangeMeta(meta) }])
      return { branch }
    } catch (error) {
      await octokit.rest.git.deleteRef({ ...repo, ref: `heads/${branch}` }).catch(() => undefined)
      throw error
    }
  }

  async function updateBranchMeta(branch: string, meta: ChangeMeta): Promise<void> {
    assertToolBranch(branch)
    const pull = await findPull(branch)
    if (pull?.state === 'open') {
      await octokit.rest.pulls.update({ ...repo, pull_number: pull.number, title: meta.title, body: meta.description })
      return
    }
    const headSha = await getBranchHead(branch)
    await commitTree(branch, headSha, `Update change details: ${meta.title}`, [
      { path: CHANGE_META_FILE, content: serializeChangeMeta(meta) },
    ])
  }

  async function getBranchDetail(branch: string): Promise<BranchDetail> {
    assertToolBranch(branch)
    const headSha = await getBranchHead(branch)
    const pull = await findPull(branch)
    // Compare against the merge base, so changes made on the base branch after
    // the branch was created do not show up as reverts.
    const facts = await describeBranch(branch, pull)
    const { mergeBaseSha } = facts
    const [config, baseConfig] = await Promise.all([readConfig(headSha), readConfig(mergeBaseSha)])
    const projects = await Promise.all(
      config.projects.map(async (project) => {
        const [before, after] = await Promise.all([
          readProjectFiles(project, mergeBaseSha),
          readProjectFiles(project, headSha),
        ])
        return {
          project: toProjectSummary(project),
          changes: diffProject(decode(project, before), decode(project, after)),
          placeholderExamples: diffConfigExamples(baseConfig, config, project.id),
        }
      }),
    )
    // yakugo.yaml edits show as example changes and the details file is this tool's own; neither is a stray file.
    const isTranslationFile = (path: string) =>
      path === CONFIG_FILE ||
      path === CHANGE_META_FILE ||
      config.projects.some((project) => {
        const location = projectFiles(project)
        return location.kind === 'single' ? location.path === path : location.pattern.localeFromPath(path) !== undefined
      })

    return {
      branch,
      title: facts.title,
      description: facts.description,
      author: facts.author,
      authorAvatar: facts.authorAvatar,
      updatedAt: facts.updatedAt,
      pull: pull ? toPullSummary(pull) : undefined,
      headSha,
      baseSha: mergeBaseSha,
      projects,
      otherFiles: facts.files.filter((path) => !isTranslationFile(path)),
    }
  }

  async function deleteBranch(branch: string): Promise<void> {
    assertToolBranch(branch)
    const pull = await findPull(branch)
    if (pull?.state === 'open') throw new HttpError(409, `Pull request #${pull.number} is open for this branch. Close it first.`)
    try {
      await octokit.rest.git.deleteRef({ ...repo, ref: `heads/${branch}` })
    } catch (error) {
      if (isNotFound(error)) throw new HttpError(404, `Branch ${branch} not found`)
      throw error
    }
  }

  async function openPull(branch: string, title: string, description: string): Promise<PullRequestSummary> {
    assertToolBranch(branch)
    const existing = await findPull(branch)
    if (existing?.state === 'open') throw new HttpError(409, `Pull request #${existing.number} is already open for this branch`)
    // From here on the PR holds the details, so the file must not reach the base branch.
    const headSha = await getBranchHead(branch)
    if ((await readFileText(CHANGE_META_FILE, headSha)) !== undefined) {
      await commitTree(branch, headSha, 'Remove change details file', [{ path: CHANGE_META_FILE, sha: null }])
    }
    const { data: pr } = await octokit.rest.pulls.create({ ...repo, title, body: description, head: branch, base: env.baseBranch })
    return toPullSummary(pr)
  }

  async function mergePull(number: number): Promise<void> {
    const { data: pr } = await octokit.rest.pulls.get({ ...repo, pull_number: number })
    assertToolBranch(pr.head.ref)
    try {
      await octokit.rest.pulls.merge({ ...repo, pull_number: number, merge_method: 'squash' })
    } catch (error) {
      throw new HttpError(409, `GitHub refused the merge: ${(error as Error).message}`)
    }
    if (pr.head.repo?.full_name === `${env.owner}/${env.repo}`) {
      await octokit.rest.git.deleteRef({ ...repo, ref: `heads/${pr.head.ref}` }).catch(() => undefined)
    }
  }

  /** Withdraws a submission: closes the PR and puts its title and body back on the branch as draft details. */
  async function closePull(number: number): Promise<void> {
    const { data: pr } = await octokit.rest.pulls.get({ ...repo, pull_number: number })
    const branch = assertToolBranch(pr.head.ref)
    if (pr.state !== 'open') throw new HttpError(409, 'This submission is not open')
    await octokit.rest.pulls.update({ ...repo, pull_number: number, state: 'closed' })
    const headSha = await getBranchHead(branch)
    await commitTree(branch, headSha, `Withdraw submission: ${pr.title}`, [
      { path: CHANGE_META_FILE, content: serializeChangeMeta({ title: pr.title, description: pr.body ?? '' }) },
    ])
  }

  return {
    listProjects,
    getSnapshot,
    listBranches,
    createBranch,
    updateBranchMeta,
    commitTranslations,
    getBranchDetail,
    deleteBranch,
    openPull,
    mergePull,
    closePull,
  }
}
