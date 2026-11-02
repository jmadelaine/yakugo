import { useCallback, useMemo, useState } from 'react'
import { compilePlaceholderPattern, type PlaceholderPattern } from '@shared/placeholders'
import { diffExamples, diffProject } from '@shared/translations'
import type { FlatTranslations, ProjectContent, TranslationChange, TranslationSnapshot, WritePayload } from '@shared/types'

export const COLUMN_KIND = { LOCALE: 'locale', FIELD: 'field' } as const
export type ColumnKind = (typeof COLUMN_KIND)[keyof typeof COLUMN_KIND]

/** One editable column: a locale, or a shared field such as a description. */
export interface Column {
  kind: ColumnKind
  name: string
}

export interface EditorModel {
  /** Placeholder matcher from the project config, using the examples as currently edited. */
  placeholders?: PlaceholderPattern
  /** Placeholder examples as currently edited; undefined when the project has no placeholders section. */
  examples?: Record<string, string>
  exampleChanges: TranslationChange[]
  setExample: (name: string, value: string) => void
  removeExample: (name: string) => void
  /** Shared fields first, then locales with the source locale leading. */
  columns: Column[]
  locales: string[]
  /** All keys, sorted alphabetically, including removed ones still shown in the table. */
  keys: string[]
  changes: TranslationChange[]
  cell: (column: Column, key: string) => string
  originalCell: (column: Column, key: string) => string
  setCell: (column: Column, key: string, value: string) => void
  isNewKey: (key: string) => boolean
  /** Existing key marked for removal; it stays in the table until the change is saved. */
  isRemovedKey: (key: string) => boolean
  addKey: (key: string) => boolean
  /** Copies every cell of `from` to `to`, then removes `from` as `removeKey` would. */
  renameKey: (from: string, to: string) => boolean
  /** Marks an existing key for removal, or drops a key that was only just added. */
  removeKey: (key: string) => void
  restoreKey: (key: string) => void
  /** Text shown in a removed row's cell. */
  removedCell: (column: Column, key: string) => string
  reset: () => void
  /** Content to write: empty cells mean "absent". */
  toPayload: () => ProjectContent
  /** Everything a save sends, minus project id and head sha. */
  toEdit: () => Pick<WritePayload, 'values' | 'fieldValues' | 'placeholderExamples'>
}

const byKey = (a: string, b: string) => a.localeCompare(b)

function keysOf(content: ProjectContent): string[] {
  const keys = new Set<string>()
  for (const map of Object.values(content.values)) for (const key of Object.keys(map)) keys.add(key)
  for (const map of Object.values(content.fieldValues)) for (const key of Object.keys(map)) keys.add(key)
  return [...keys].sort(byKey)
}

function mapOf(content: ProjectContent, column: Column): FlatTranslations | undefined {
  return column.kind === COLUMN_KIND.LOCALE ? content.values[column.name] : content.fieldValues[column.name]
}

function stripEmpty(map: FlatTranslations, keys: string[]): FlatTranslations {
  const out: FlatTranslations = {}
  for (const key of keys) {
    const value = map[key]
    if (value !== undefined && value !== '') out[key] = value
  }
  return out
}

/**
 * @param snapshot  Content of the branch being edited; changes are computed against it.
 * @param baseline  Content of the base branch when editing a saved change. Keys that
 *                  exist there but not on the branch show as removed rows that can be restored.
 */
export function useTranslationEditor(snapshot: TranslationSnapshot, baseline?: ProjectContent): EditorModel {
  const { data } = snapshot
  const placeholderConfig = snapshot.project.placeholders
  const [examples, setExamples] = useState<Record<string, string> | undefined>(() =>
    placeholderConfig ? { ...placeholderConfig.examples } : undefined,
  )
  const placeholders = useMemo(
    () => (placeholderConfig && examples ? compilePlaceholderPattern({ ...placeholderConfig, examples }) : undefined),
    [placeholderConfig, examples],
  )
  const exampleChanges = useMemo(
    () => (placeholderConfig && examples ? diffExamples(placeholderConfig.examples, examples) : []),
    [placeholderConfig, examples],
  )
  const setExample = useCallback((name: string, value: string) => {
    setExamples((prev) => (prev ? { ...prev, [name]: value } : prev))
  }, [])
  const removeExample = useCallback((name: string) => {
    setExamples((prev) => {
      if (!prev) return prev
      const { [name]: _removed, ...rest } = prev
      return rest
    })
  }, [])
  const original = useMemo<ProjectContent>(() => ({ values: data.values, fieldValues: data.fieldValues }), [data])
  const columns = useMemo<Column[]>(
    () => [
      ...data.fields.map((name) => ({ kind: COLUMN_KIND.FIELD, name })),
      ...data.locales.map((name) => ({ kind: COLUMN_KIND.LOCALE, name })),
    ],
    [data],
  )
  // Keys deleted on the branch: present in the baseline, absent from the branch.
  const deletedOnBranch = useMemo(() => {
    if (!baseline) return []
    const branchKeys = new Set(keysOf(original))
    return keysOf(baseline).filter((key) => !branchKeys.has(key))
  }, [original, baseline])
  const [keys, setKeys] = useState(() => [...keysOf(original), ...deletedOnBranch].sort(byKey))
  const [content, setContent] = useState<ProjectContent>(() => structuredClone(original))
  const [removed, setRemoved] = useState<Set<string>>(() => new Set(deletedOnBranch))

  const cell = useCallback((column: Column, key: string) => mapOf(content, column)?.[key] ?? '', [content])
  const originalCell = useCallback((column: Column, key: string) => mapOf(original, column)?.[key] ?? '', [original])
  const inOriginal = useCallback(
    (key: string) => columns.some((column) => mapOf(original, column)?.[key] !== undefined),
    [columns, original],
  )
  const isNewKey = useCallback((key: string) => !inOriginal(key) && !deletedOnBranch.includes(key), [inOriginal, deletedOnBranch])
  /** Value a removed row displays: from the branch, or from the baseline for keys deleted on the branch. */
  const removedCell = useCallback(
    (column: Column, key: string) => mapOf(original, column)?.[key] ?? (baseline ? (mapOf(baseline, column)?.[key] ?? '') : ''),
    [original, baseline],
  )
  const isRemovedKey = useCallback((key: string) => removed.has(key), [removed])

  const setCell = useCallback((column: Column, key: string, value: string) => {
    setContent((prev) => {
      const group = column.kind === COLUMN_KIND.LOCALE ? 'values' : 'fieldValues'
      return { ...prev, [group]: { ...prev[group], [column.name]: { ...prev[group][column.name], [key]: value } } }
    })
  }, [])

  const addKey = useCallback(
    (rawKey: string) => {
      const key = rawKey.trim()
      if (!key || keys.includes(key)) return false
      setKeys((prev) => [...prev, key].sort(byKey))
      return true
    },
    [keys],
  )

  const removeKey = useCallback(
    (key: string) => {
      if (isNewKey(key)) {
        setKeys((prev) => prev.filter((k) => k !== key))
        setContent((prev) => {
          const drop = (maps: Record<string, FlatTranslations>) =>
            Object.fromEntries(
              Object.entries(maps).map(([name, map]) => {
                const { [key]: _removed, ...rest } = map
                return [name, rest]
              }),
            )
          return { values: drop(prev.values), fieldValues: drop(prev.fieldValues) }
        })
        return
      }
      setRemoved((prev) => new Set(prev).add(key))
    },
    [isNewKey],
  )

  const renameKey = useCallback(
    (from: string, rawTo: string) => {
      const to = rawTo.trim()
      if (!to || to === from || keys.includes(to)) return false
      setContent((prev) => {
        const copy = (maps: Record<string, FlatTranslations>) =>
          Object.fromEntries(
            Object.entries(maps).map(([name, map]) => [name, from in map ? { ...map, [to]: map[from] } : map]),
          )
        return { values: copy(prev.values), fieldValues: copy(prev.fieldValues) }
      })
      setKeys((prev) => [...prev, to].sort(byKey))
      removeKey(from)
      return true
    },
    [keys, removeKey],
  )

  const restoreKey = useCallback(
    (key: string) => {
      setRemoved((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      // A key deleted on the branch comes back with its baseline values.
      if (baseline && !inOriginal(key)) {
        setContent((prev) => {
          const next = structuredClone(prev)
          for (const column of columns) {
            const value = mapOf(baseline, column)?.[key]
            if (value === undefined) continue
            const group = column.kind === COLUMN_KIND.LOCALE ? next.values : next.fieldValues
            ;(group[column.name] ??= {})[key] = value
          }
          return next
        })
      }
    },
    [baseline, columns, inOriginal],
  )

  const reset = useCallback(() => {
    setKeys([...keysOf(original), ...deletedOnBranch].sort(byKey))
    setContent(structuredClone(original))
    setRemoved(new Set(deletedOnBranch))
    setExamples(placeholderConfig ? { ...placeholderConfig.examples } : undefined)
  }, [original, deletedOnBranch, placeholderConfig])

  const toPayload = useCallback((): ProjectContent => {
    const kept = keys.filter((key) => !removed.has(key))
    const values: Record<string, FlatTranslations> = {}
    for (const locale of data.locales) values[locale] = stripEmpty(content.values[locale] ?? {}, kept)
    const fieldValues: Record<string, FlatTranslations> = {}
    for (const field of data.fields) fieldValues[field] = stripEmpty(content.fieldValues[field] ?? {}, kept)
    return { values, fieldValues }
  }, [data, keys, content, removed])

  const changes = useMemo(() => diffProject(original, toPayload()), [original, toPayload])

  const toEdit = useCallback(
    () => ({ ...toPayload(), ...(exampleChanges.length > 0 && examples ? { placeholderExamples: examples } : {}) }),
    [toPayload, exampleChanges, examples],
  )

  return {
    placeholders,
    examples,
    exampleChanges,
    setExample,
    removeExample,
    columns,
    locales: data.locales,
    keys,
    changes,
    cell,
    originalCell,
    setCell,
    isNewKey,
    isRemovedKey,
    addKey,
    renameKey,
    removeKey,
    restoreKey,
    removedCell,
    reset,
    toPayload,
    toEdit,
  }
}

/** Keys whose name or any cell text contains `query` (case-insensitive). Empty query keeps all keys. */
export function filterKeys(editor: Pick<EditorModel, 'keys' | 'columns' | 'cell'>, query: string): string[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return editor.keys
  return editor.keys.filter(
    (key) =>
      key.toLowerCase().includes(needle) ||
      editor.columns.some((column) => editor.cell(column, key).toLowerCase().includes(needle)),
  )
}
