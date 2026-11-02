import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ChangeMeta } from '../shared/changeMeta'
import { CONFIG_FILE, projectFiles, type ProjectConfig, type YakugoConfig } from '../shared/config'
import { decodeProject, encodeProject, type FileTexts } from '../shared/format'
import { diffProject, mergeProject, slugify, type LocaleWrite } from '../shared/translations'
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

/** Repo-relative path → file text: yakugo.yaml plus the translation files of every project. */
type Tree = FileTexts

interface StoredBranch {
  files: Tree
  /** Base branch contents when the branch was created; the merge base for diffs. */
  baseFiles: Tree
  /** Name given when the change was created, or renamed to. */
  title: string
  description: string
  author: string
  updatedAt: string
}

interface StoredPull {
  number: number
  title: string
  body: string
  branch: string
  state: 'open' | 'closed'
  merged: boolean
  createdAt: string
}

interface State {
  nextNumber: number
  branches: Record<string, StoredBranch>
  pulls: StoredPull[]
}

const STATE_FILE = '.state.json'

function treeSha(tree: Tree): string {
  const hash = createHash('sha1')
  for (const path of Object.keys(tree).sort()) hash.update(path).update('\0').update(tree[path]).update('\0')
  return hash.digest('hex')
}

function decode(project: ProjectConfig, tree: Tree) {
  try {
    return decodeProject(project, tree)
  } catch (error) {
    throw new HttpError(500, (error as Error).message)
  }
}

function avatar(login: string): string {
  return `https://github.com/identicons/${login}.png`
}

function toPullSummary(pull: StoredPull, conflicts: string[]): PullRequestSummary {
  return {
    number: pull.number,
    title: pull.title,
    body: pull.body,
    state: pull.state,
    merged: pull.merged,
    draft: false,
    mergeable: conflicts.length === 0,
    mergeableState: conflicts.length === 0 ? 'clean' : 'dirty',
    createdAt: pull.createdAt,
    url: '',
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/**
 * Repository backed by a folder on disk, for development without GitHub.
 * The folder is the base branch: `yakugo.yaml` plus each project's files.
 * Proposed branches and pull requests live in `<dir>/.state.json`.
 */
export function createLocalRepository(dir: string): Repository {
  const statePath = join(dir, STATE_FILE)

  async function readState(): Promise<State> {
    const text = await readOptional(statePath)
    return text === undefined ? { nextNumber: 1, branches: {}, pulls: [] } : (JSON.parse(text) as State)
  }

  async function writeState(state: State): Promise<void> {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`)
  }

  /** Config as stored in a tree; the base branch reads it from disk. */
  function configOf(tree: Tree): YakugoConfig {
    return loadConfig(tree[CONFIG_FILE])
  }

  async function readConfig(): Promise<YakugoConfig> {
    return loadConfig(await readOptional(join(dir, CONFIG_FILE)))
  }

  async function readBaseTree(config: YakugoConfig): Promise<Tree> {
    const tree: Tree = {}
    const configText = await readOptional(join(dir, CONFIG_FILE))
    if (configText !== undefined) tree[CONFIG_FILE] = configText
    for (const project of config.projects) {
      const location = projectFiles(project)
      if (location.kind === 'single') {
        const text = await readOptional(join(dir, location.path))
        if (text !== undefined) tree[location.path] = text
        continue
      }
      const { pattern } = location
      let names: string[]
      try {
        names = await readdir(join(dir, pattern.dir))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      for (const name of names.sort()) {
        if (!pattern.localeFromEntry(name)) continue
        const relative = [pattern.dir, name, pattern.suffix].filter(Boolean).join('/')
        const text = await readOptional(join(dir, relative))
        if (text !== undefined) tree[relative] = text
      }
    }
    return tree
  }

  async function writeBaseTree(writes: LocaleWrite[]): Promise<void> {
    for (const write of writes) {
      const target = join(dir, write.path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, write.content)
    }
  }

  async function readTree(state: State, config: YakugoConfig, branch: string): Promise<Tree> {
    if (branch === env.baseBranch) return readBaseTree(config)
    const stored = state.branches[branch]
    if (!stored) throw new HttpError(404, `Branch ${branch} not found`)
    return stored.files
  }

  async function listProjects(): Promise<ProjectSummary[]> {
    return (await readConfig()).projects.map(toProjectSummary)
  }

  async function getSnapshot(projectId: string, branch: string): Promise<TranslationSnapshot> {
    const tree = await readTree(await readState(), await readConfig(), branch)
    // A branch may carry its own edited yakugo.yaml, e.g. new placeholder examples.
    const project = findProject(configOf(tree), projectId)
    return {
      repo: `${env.owner}/${env.repo}`,
      project: toProjectSummary(project),
      branch,
      headSha: treeSha(tree),
      data: decode(project, tree),
    }
  }

  /** Most recent pull for a branch, open first. */
  /** The open pull, else a merged one. A closed, unmerged pull means the branch is a draft again. */
  function pullFor(state: State, branch: string): StoredPull | undefined {
    const pulls = state.pulls.filter((pull) => pull.branch === branch)
    return pulls.find((pull) => pull.state === 'open') ?? pulls.find((pull) => pull.merged)
  }

  function findBranch(state: State, branch: string): StoredBranch {
    const stored = state.branches[assertToolBranch(branch)]
    if (!stored) throw new HttpError(404, `Branch ${branch} not found`)
    return stored
  }

  /**
   * Per-project three-way merge of a branch onto the current base branch.
   * Placeholder examples edited on the branch are applied onto the base config.
   */
  function mergeBranch(config: YakugoConfig, branch: StoredBranch, base: Tree) {
    const writes: LocaleWrite[] = []
    const conflicts: string[] = []
    const branchConfig = configOf(branch.files)
    let configText = base[CONFIG_FILE]
    for (const project of config.projects) {
      const result = mergeProject(decode(project, branch.baseFiles), decode(project, base), decode(project, branch.files))
      conflicts.push(...result.conflicts.map((conflict) => `${project.name} ${conflict}`))
      writes.push(...encodeProject(project, base, result.merged))
      const edited = branchConfig.projects.find((entry) => entry.id === project.id)?.placeholders?.examples
      if (edited && configText !== undefined && diffConfigExamples(configOf(branch.baseFiles), branchConfig, project.id).length > 0) {
        configText = planConfigWrite(configText, project, { content: result.merged, placeholderExamples: edited })?.content ?? configText
      }
    }
    if (configText !== undefined && configText !== base[CONFIG_FILE]) writes.push({ path: CONFIG_FILE, content: configText })
    return { writes, conflicts }
  }

  function toBranchSummary(state: State, name: string, stored: StoredBranch, conflicts: string[]): BranchSummary {
    const pull = pullFor(state, name)
    return {
      branch: name,
      title: pull?.title ?? stored.title,
      description: pull?.body ?? stored.description ?? '',
      author: stored.author,
      authorAvatar: avatar(stored.author),
      updatedAt: stored.updatedAt,
      pull: pull ? toPullSummary(pull, conflicts) : undefined,
    }
  }

  async function listBranches(): Promise<BranchSummary[]> {
    const state = await readState()
    return Object.entries(state.branches)
      .map(([name, stored]) => toBranchSummary(state, name, stored, []))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async function commitTranslations(
    projectId: string,
    branch: string,
    expectedHeadSha: string,
    edit: ProjectEdit,
    message: string,
  ): Promise<CommitResult> {
    const state = await readState()
    const tree = await readTree(state, await readConfig(), branch)
    if (treeSha(tree) !== expectedHeadSha) {
      throw new HttpError(409, 'The branch changed since you loaded it. Reload and apply your edits again.')
    }
    const project = findProject(configOf(tree), projectId)

    let writes
    try {
      writes = encodeProject(project, tree, edit.content)
    } catch (error) {
      throw new HttpError(400, (error as Error).message)
    }
    const configWrite = planConfigWrite(tree[CONFIG_FILE], project, edit)
    if (configWrite) writes.push(configWrite)
    if (writes.length === 0) throw new HttpError(400, 'No changes to commit')

    const next: Tree = { ...tree }
    for (const write of writes) next[write.path] = write.content
    if (branch === env.baseBranch) {
      await writeBaseTree(writes)
    } else {
      const stored = findBranch(state, branch)
      state.branches[branch] = { ...stored, files: next, updatedAt: new Date().toISOString() }
      await writeState(state)
    }
    console.log(`[local] ${branch}: ${message}`)
    return { sha: treeSha(next), changedFiles: writes.map((write) => write.path) }
  }

  async function createBranch(login: string, meta: ChangeMeta): Promise<{ branch: string }> {
    const config = await readConfig()
    const state = await readState()
    const base = await readBaseTree(config)
    const branch = `${env.branchPrefix}${slugify(login)}/${slugify(meta.title)}-${Date.now().toString(36)}`
    state.branches[branch] = {
      files: base,
      baseFiles: base,
      title: meta.title,
      description: meta.description,
      author: login,
      updatedAt: new Date().toISOString(),
    }
    await writeState(state)
    return { branch }
  }

  async function updateBranchMeta(branch: string, meta: ChangeMeta): Promise<void> {
    const state = await readState()
    const stored = findBranch(state, branch)
    const pull = pullFor(state, branch)
    if (pull?.state === 'open') {
      pull.title = meta.title
      pull.body = meta.description
    } else {
      stored.title = meta.title
      stored.description = meta.description
    }
    await writeState(state)
  }

  async function getBranchDetail(branch: string): Promise<BranchDetail> {
    const config = await readConfig()
    const state = await readState()
    const stored = findBranch(state, branch)
    const base = await readBaseTree(config)
    const { conflicts } = mergeBranch(config, stored, base)

    return {
      ...toBranchSummary(state, branch, stored, conflicts),
      headSha: treeSha(stored.files),
      baseSha: treeSha(base),
      projects: configOf(stored.files).projects.map((project) => ({
        project: toProjectSummary(project),
        changes: diffProject(decode(project, stored.baseFiles), decode(project, stored.files)),
        placeholderExamples: diffConfigExamples(configOf(stored.baseFiles), configOf(stored.files), project.id),
      })),
      otherFiles: [],
    }
  }

  async function deleteBranch(branch: string): Promise<void> {
    const state = await readState()
    findBranch(state, branch)
    const pull = pullFor(state, branch)
    if (pull?.state === 'open') throw new HttpError(409, `Pull request #${pull.number} is open for this branch. Close it first.`)
    delete state.branches[branch]
    await writeState(state)
  }

  async function openPull(branch: string, title: string, description: string): Promise<PullRequestSummary> {
    const state = await readState()
    findBranch(state, branch)
    const existing = pullFor(state, branch)
    if (existing?.state === 'open') throw new HttpError(409, `Pull request #${existing.number} is already open for this branch`)
    const pull: StoredPull = {
      number: state.nextNumber,
      title,
      body: description,
      branch,
      state: 'open',
      merged: false,
      createdAt: new Date().toISOString(),
    }
    state.nextNumber += 1
    state.pulls.push(pull)
    await writeState(state)
    return toPullSummary(pull, [])
  }

  function findPull(state: State, number: number): StoredPull {
    const pull = state.pulls.find((pull) => pull.number === number)
    if (!pull) throw new HttpError(404, `Pull request #${number} not found`)
    return pull
  }

  async function mergePull(number: number): Promise<void> {
    const config = await readConfig()
    const state = await readState()
    const pull = findPull(state, number)
    if (pull.state !== 'open') throw new HttpError(409, 'Pull request is not open')
    const stored = findBranch(state, pull.branch)
    const { writes, conflicts } = mergeBranch(config, stored, await readBaseTree(config))
    if (conflicts.length > 0) {
      throw new HttpError(409, `Cannot merge: these cells also changed on ${env.baseBranch} (${conflicts.join(', ')})`)
    }

    await writeBaseTree(writes)
    pull.state = 'closed'
    pull.merged = true
    // Like GitHub, the branch goes away once merged.
    delete state.branches[pull.branch]
    await writeState(state)
  }

  /** Withdraws a submission: closes the pull and keeps its title and body as the draft's details. */
  async function closePull(number: number): Promise<void> {
    const state = await readState()
    const pull = findPull(state, number)
    if (pull.state !== 'open') throw new HttpError(409, 'This submission is not open')
    pull.state = 'closed'
    const stored = state.branches[pull.branch]
    if (stored) {
      stored.title = pull.title
      stored.description = pull.body
    }
    await writeState(state)
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
