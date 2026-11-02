import type { PlaceholderConfig } from './placeholders'

/** Dot-separated key → string value. */
export type FlatTranslations = Record<string, string>

/** Editable content of one project: per-locale values and shared per-key fields. */
export interface ProjectContent {
  /** locale → key → text. A missing key means "absent in this locale". */
  values: Record<string, FlatTranslations>
  /** field name → key → text, shared by all locales. */
  fieldValues: Record<string, FlatTranslations>
}

export interface ProjectData extends ProjectContent {
  /** Locales found in the files, source locale first. */
  locales: string[]
  /** Custom field names in config order. */
  fields: string[]
}

/** One translation project from yakugo.yaml, as shown to the UI. */
export interface ProjectSummary {
  id: string
  name: string
  path: string
  sourceLocale: string
  placeholders?: PlaceholderConfig
}

export interface TranslationSnapshot {
  repo: string
  project: ProjectSummary
  branch: string
  /** Commit the files were read from. Sent back on write to detect concurrent edits. */
  headSha: string
  data: ProjectData
}

export const CHANGE_TYPE = {
  ADDED: 'added',
  REMOVED: 'removed',
  CHANGED: 'changed',
} as const

export type ChangeType = (typeof CHANGE_TYPE)[keyof typeof CHANGE_TYPE]

/** One changed cell: a locale value or a shared field of `key`. Exactly one of locale/field is set. */
export interface TranslationChange {
  key: string
  locale?: string
  field?: string
  type: ChangeType
  before?: string
  after?: string
}

export interface PullRequestSummary {
  number: number
  title: string
  body: string
  state: 'open' | 'closed'
  merged: boolean
  draft: boolean
  /** null while GitHub is still computing mergeability. */
  mergeable: boolean | null
  mergeableState: string
  createdAt: string
  url: string
}

/**
 * A change is a branch created by this tool. Without a pull request it is a
 * draft that can still be edited and then proposed.
 */
export interface BranchSummary {
  branch: string
  /** Name of the change, or the PR title once proposed. */
  title: string
  /** Free text about the change, or the PR body once proposed. */
  description: string
  author: string
  authorAvatar: string
  updatedAt: string
  pull?: PullRequestSummary
}

export interface ProjectChanges {
  project: ProjectSummary
  changes: TranslationChange[]
  /** Edits to `placeholders.examples` in yakugo.yaml; `key` is the placeholder name. */
  placeholderExamples: TranslationChange[]
}

export interface BranchDetail extends BranchSummary {
  headSha: string
  baseSha: string
  /** Translation diff per project against the merge base; every project is listed. */
  projects: ProjectChanges[]
  /** Changed files that are not translation files. */
  otherFiles: string[]
}

export interface WritePayload extends ProjectContent {
  /** Project id from yakugo.yaml. */
  project: string
  /** Head commit of the branch the client loaded. */
  expectedHeadSha: string
  /** Full set of placeholder examples to store in yakugo.yaml; omitted when untouched. */
  placeholderExamples?: Record<string, string>
}

/** Starts a change: a branch from the base branch head holding only the change's details. */
export interface CreateBranchRequest {
  /** Short name of the change; also used for the branch slug. */
  title: string
  description?: string
}

/** Renames a change or edits its description. */
export interface BranchMetaRequest {
  title: string
  description: string
}

/** Second stage: opens the pull request for a draft branch. */
export interface ProposeRequest {
  title: string
  description: string
}

export interface User {
  login: string
  name: string | null
  avatarUrl: string
}
