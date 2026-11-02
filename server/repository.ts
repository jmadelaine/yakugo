import type { ChangeMeta } from '../shared/changeMeta'
import { CONFIG_FILE, defaultConfig, parseConfig, type ProjectConfig, type YakugoConfig } from '../shared/config'
import { updatePlaceholderExamples } from '../shared/configEdit'
import { diffExamples, type LocaleWrite } from '../shared/translations'
import type {
  BranchDetail,
  BranchSummary,
  ProjectContent,
  ProjectSummary,
  PullRequestSummary,
  TranslationChange,
  TranslationSnapshot,
} from '../shared/types'
import type { Session } from './session'
import { env } from './env'
import { HttpError } from './errors'
import { createGitHubRepository } from './github'
import { createLocalRepository } from './local'

export interface CommitResult {
  sha: string
  changedFiles: string[]
}

/** What one save writes: the project's content, and optionally its placeholder examples in yakugo.yaml. */
export interface ProjectEdit {
  content: ProjectContent
  placeholderExamples?: Record<string, string>
}

/** The yakugo.yaml write for `edit`, or undefined when examples are untouched or unchanged. */
export function planConfigWrite(configText: string | undefined, project: ProjectConfig, edit: ProjectEdit): LocaleWrite | undefined {
  if (!edit.placeholderExamples) return undefined
  if (configText === undefined) throw new HttpError(400, `Placeholder examples need a ${CONFIG_FILE} in the repo`)
  if (!project.placeholders) throw new HttpError(400, `${project.name} has no placeholders section in ${CONFIG_FILE}`)
  let next
  try {
    next = updatePlaceholderExamples(configText, project.name, edit.placeholderExamples)
  } catch (error) {
    throw new HttpError(400, (error as Error).message)
  }
  return next === configText ? undefined : { path: CONFIG_FILE, content: next }
}

/** Example diffs for every project between two configs, matched by project id. */
export function diffConfigExamples(before: YakugoConfig, after: YakugoConfig, projectId: string): TranslationChange[] {
  const previous = before.projects.find((project) => project.id === projectId)?.placeholders?.examples ?? {}
  const current = after.projects.find((project) => project.id === projectId)?.placeholders?.examples ?? {}
  return diffExamples(previous, current)
}

/** Everything the API needs from the place translations live. */
export interface Repository {
  /** Projects declared in yakugo.yaml on the base branch. */
  listProjects(): Promise<ProjectSummary[]>
  getSnapshot(projectId: string, branch: string): Promise<TranslationSnapshot>
  /** Branches created by this tool, drafts and proposed ones, newest first. */
  listBranches(): Promise<BranchSummary[]>
  /** Creates `i18n/<user>/<slug>-<ts>` from the base head, holding the change's details. */
  createBranch(login: string, meta: ChangeMeta): Promise<{ branch: string }>
  /** Renames a change or edits its description; on a proposed change this edits the PR. */
  updateBranchMeta(branch: string, meta: ChangeMeta): Promise<void>
  /**
   * Writes the given project edit to `branch` as one commit. Fails with 409
   * when the branch moved since the client loaded it.
   */
  commitTranslations(projectId: string, branch: string, expectedHeadSha: string, edit: ProjectEdit, message: string): Promise<CommitResult>
  getBranchDetail(branch: string): Promise<BranchDetail>
  /** Deletes a draft branch. Refused when a pull request is open for it. */
  deleteBranch(branch: string): Promise<void>
  openPull(branch: string, title: string, description: string): Promise<PullRequestSummary>
  mergePull(number: number): Promise<void>
  closePull(number: number): Promise<void>
}

/** Rejects branch names outside this tool's prefix, so the API cannot touch other branches. */
export function assertToolBranch(branch: string): string {
  if (!branch.startsWith(env.branchPrefix) || branch.includes('..') || /\s/.test(branch)) {
    throw new HttpError(404, `Branch ${branch} is not a translation change`)
  }
  return branch
}

export function getRepository(session: Session): Repository {
  return env.localDataDir ? createLocalRepository(env.localDataDir) : createGitHubRepository(session.token)
}

const configDefaults = { files: '{locale}.json', sourceLocale: env.sourceLocale }

/** Builds the config from the repo's yakugo.yaml, or a one-project default when there is none. */
export function loadConfig(text: string | undefined): YakugoConfig {
  if (text === undefined) return defaultConfig(env.localesDir, configDefaults)
  try {
    return parseConfig(text, configDefaults)
  } catch (error) {
    throw new HttpError(500, (error as Error).message)
  }
}

export function findProject(config: YakugoConfig, id: string): ProjectConfig {
  const project = config.projects.find((project) => project.id === id)
  if (!project) throw new HttpError(404, `Project "${id}" is not in yakugo.yaml`)
  return project
}

export function toProjectSummary(project: ProjectConfig): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    sourceLocale: project.sourceLocale,
    ...(project.placeholders ? { placeholders: project.placeholders } : {}),
  }
}
