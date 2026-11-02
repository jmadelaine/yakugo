import { CHANGE_TYPE, type FlatTranslations, type ProjectContent, type TranslationChange } from './types'

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
  return changes.sort((a, b) => a.key.localeCompare(b.key) || (a.locale ?? '').localeCompare(b.locale ?? ''))
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

export interface LocaleWrite {
  path: string
  content: string
}

export interface MergeConflict {
  locale: string
  key: string
}

export interface MergeResult {
  merged: Record<string, FlatTranslations>
  conflicts: MergeConflict[]
}

/**
 * Key-level three-way merge. A key changed on only one side takes that side's
 * value; a key changed to different values on both sides is a conflict and
 * keeps `ours`.
 */
export function mergeTranslations(
  base: Record<string, FlatTranslations>,
  ours: Record<string, FlatTranslations>,
  theirs: Record<string, FlatTranslations>,
): MergeResult {
  const merged: Record<string, FlatTranslations> = {}
  const conflicts: MergeConflict[] = []
  const locales = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])
  for (const locale of locales) {
    const b = base[locale] ?? {}
    const o = ours[locale] ?? {}
    const t = theirs[locale] ?? {}
    const out: FlatTranslations = {}
    const keys = new Set([...Object.keys(b), ...Object.keys(o), ...Object.keys(t)])
    for (const key of keys) {
      let value: string | undefined
      if (t[key] === b[key]) value = o[key]
      else if (o[key] === b[key] || o[key] === t[key]) value = t[key]
      else {
        conflicts.push({ locale, key })
        value = o[key]
      }
      if (value !== undefined) out[key] = value
    }
    merged[locale] = out
  }
  return { merged, conflicts }
}

/** Diff of locale values and shared fields. Field changes carry `field` instead of `locale`. */
export function diffProject(before: ProjectContent, after: ProjectContent): TranslationChange[] {
  const fieldChanges = diffTranslations(before.fieldValues, after.fieldValues).map(
    ({ locale, ...change }): TranslationChange => ({ ...change, field: locale }),
  )
  // Within a key: locale values first, then shared fields.
  const rank = (change: TranslationChange) => (change.locale !== undefined ? 0 : 1)
  return [...diffTranslations(before.values, after.values), ...fieldChanges].sort(
    (a, b) =>
      a.key.localeCompare(b.key) || rank(a) - rank(b) || (a.locale ?? a.field ?? '').localeCompare(b.locale ?? b.field ?? ''),
  )
}

export interface ProjectMergeResult {
  merged: ProjectContent
  /** Human-readable "locale: key" / "field: key" labels of conflicting cells. */
  conflicts: string[]
}

/** Three-way merge of values and shared fields; see `mergeTranslations`. */
export function mergeProject(base: ProjectContent, ours: ProjectContent, theirs: ProjectContent): ProjectMergeResult {
  const values = mergeTranslations(base.values, ours.values, theirs.values)
  const fields = mergeTranslations(base.fieldValues, ours.fieldValues, theirs.fieldValues)
  return {
    merged: { values: values.merged, fieldValues: fields.merged },
    conflicts: [...values.conflicts, ...fields.conflicts].map((conflict) => `${conflict.locale}: ${conflict.key}`),
  }
}

/** Diff of placeholder example values. Each change carries the placeholder name as `key`. */
export function diffExamples(before: Record<string, string>, after: Record<string, string>): TranslationChange[] {
  return diffLocale('example', before, after)
    .map(({ locale: _locale, ...change }): TranslationChange => ({ ...change, field: 'example' }))
    .sort((a, b) => a.key.localeCompare(b.key))
}
