import { parse, stringify } from 'yaml'

/**
 * Details of a draft change, kept in this file on its branch until it is
 * proposed; then the pull request carries them and the file is removed.
 */
export const CHANGE_META_FILE = '.yakugo/change.yaml'

export interface ChangeMeta {
  title: string
  description: string
}

export function parseChangeMeta(text: string): ChangeMeta | undefined {
  const data: unknown = parse(text)
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return undefined
  const { title, description } = data as Record<string, unknown>
  if (typeof title !== 'string' || !title.trim()) return undefined
  return { title: title.trim(), description: typeof description === 'string' ? description : '' }
}

export function serializeChangeMeta(meta: ChangeMeta): string {
  return stringify({ title: meta.title, description: meta.description })
}
