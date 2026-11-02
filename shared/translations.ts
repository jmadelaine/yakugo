import { CHANGE_TYPE, type FlatTranslations, type TranslationChange } from './types'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

function isObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Flattens nested objects to dot-keys. Non-string leaves (numbers, arrays, …)
 * are kept as their JSON text so they survive a round trip as strings.
 */
export function flatten(value: JsonValue, prefix = '', out: FlatTranslations = {}): FlatTranslations {
  if (!isObject(value)) {
    throw new Error('Translation file must contain a JSON object at the top level')
  }
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (isObject(child)) {
      flatten(child, fullKey, out)
    } else {
      out[fullKey] = typeof child === 'string' ? child : JSON.stringify(child)
    }
  }
  return out
}

export function hasNestedObjects(value: JsonValue): boolean {
  return isObject(value) && Object.values(value).some(isObject)
}

export function unflatten(flat: FlatTranslations): { [key: string]: JsonValue } {
  const root: { [key: string]: JsonValue } = {}
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.')
    let node = root
    for (const part of parts.slice(0, -1)) {
      const existing = node[part]
      if (isObject(existing)) {
        node = existing
      } else {
        const created: { [key: string]: JsonValue } = {}
        node[part] = created
        node = created
      }
    }
    node[parts[parts.length - 1]] = value
  }
  return root
}

export function parseTranslationFile(text: string): { entries: FlatTranslations; nested: boolean } {
  const json = JSON.parse(text) as JsonValue
  return { entries: flatten(json), nested: hasNestedObjects(json) }
}

export function serializeTranslationFile(entries: FlatTranslations, nested: boolean): string {
  const value = nested ? unflatten(entries) : entries
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Key-level diff of one locale. */
export function diffLocale(locale: string, before: FlatTranslations, after: FlatTranslations): TranslationChange[] {
  const changes: TranslationChange[] = []
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    const inBefore = key in before
    const inAfter = key in after
    if (inBefore && !inAfter) {
      changes.push({ key, locale, type: CHANGE_TYPE.REMOVED, before: before[key] })
    } else if (!inBefore && inAfter) {
      changes.push({ key, locale, type: CHANGE_TYPE.ADDED, after: after[key] })
    } else if (before[key] !== after[key]) {
      changes.push({ key, locale, type: CHANGE_TYPE.CHANGED, before: before[key], after: after[key] })
    }
  }
  return changes
}

/** Diff across all locales. Locales missing on one side count as empty. */
export function diffTranslations(
  before: Record<string, FlatTranslations>,
  after: Record<string, FlatTranslations>,
): TranslationChange[] {
  const locales = new Set([...Object.keys(before), ...Object.keys(after)])
  const changes: TranslationChange[] = []
  for (const locale of locales) {
    changes.push(...diffLocale(locale, before[locale] ?? {}, after[locale] ?? {}))
  }
  return changes.sort((a, b) => a.key.localeCompare(b.key) || a.locale.localeCompare(b.locale))
}

export interface KeyChangeGroup {
  key: string
  changes: TranslationChange[]
}

export function groupChangesByKey(changes: TranslationChange[]): KeyChangeGroup[] {
  const groups = new Map<string, TranslationChange[]>()
  for (const change of changes) {
    const list = groups.get(change.key)
    if (list) list.push(change)
    else groups.set(change.key, [change])
  }
  return [...groups.entries()].map(([key, list]) => ({ key, changes: list }))
}

/** Branch-name-safe slug, e.g. "Fix German checkout copy" → "fix-german-checkout-copy". */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'update'
  )
}
