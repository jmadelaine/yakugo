/** Dot-separated key → string value. */
export type FlatTranslations = Record<string, string>

export interface LocaleFile {
  locale: string
  path: string
  /** True when the JSON file uses nested objects rather than flat dot-keys. */
  nested: boolean
  entries: FlatTranslations
}

export interface TranslationSnapshot {
  repo: string
  branch: string
  /** Commit the files were read from. Sent back on write to detect concurrent edits. */
  headSha: string
  sourceLocale: string
  locales: LocaleFile[]
}

export const CHANGE_TYPE = {
  ADDED: 'added',
  REMOVED: 'removed',
  CHANGED: 'changed',
} as const

export type ChangeType = (typeof CHANGE_TYPE)[keyof typeof CHANGE_TYPE]

export interface TranslationChange {
  key: string
  locale: string
  type: ChangeType
  before?: string
  after?: string
}

export interface PullRequestSummary {
  number: number
  title: string
  author: string
  authorAvatar: string
  branch: string
  draft: boolean
  createdAt: string
  updatedAt: string
  url: string
}

export interface PullRequestDetail extends PullRequestSummary {
  body: string
  state: 'open' | 'closed'
  merged: boolean
  /** null while GitHub is still computing mergeability. */
  mergeable: boolean | null
  mergeableState: string
  baseSha: string
  headSha: string
  changes: TranslationChange[]
  /** Changed files that are not translation files. */
  otherFiles: string[]
}

export interface WritePayload {
  /** Head commit of the branch the client loaded. */
  expectedHeadSha: string
  /** Full new content per locale. */
  locales: Record<string, FlatTranslations>
}

export interface ProposeRequest extends WritePayload {
  title: string
  description: string
}

export interface User {
  login: string
  name: string | null
  avatarUrl: string
}
