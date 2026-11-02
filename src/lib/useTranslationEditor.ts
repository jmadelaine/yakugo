import { useCallback, useMemo, useState } from 'react'
import { diffTranslations } from '@shared/translations'
import type { FlatTranslations, TranslationSnapshot } from '@shared/types'

export interface EditorModel {
  locales: string[]
  /** All keys in display order: source-locale order first, then keys only present elsewhere, then new keys. */
  keys: string[]
  values: Record<string, FlatTranslations>
  original: Record<string, FlatTranslations>
  changes: ReturnType<typeof diffTranslations>
  setValue: (locale: string, key: string, value: string) => void
  addKey: (key: string) => boolean
  removeKey: (key: string) => void
  reset: () => void
  /** Content to write: empty cells mean "key absent in this locale". */
  toPayload: () => Record<string, FlatTranslations>
}

function keysOf(snapshot: TranslationSnapshot): string[] {
  const seen = new Set<string>()
  const keys: string[] = []
  for (const file of snapshot.locales) {
    for (const key of Object.keys(file.entries)) {
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
  }
  return keys
}

export function useTranslationEditor(snapshot: TranslationSnapshot): EditorModel {
  const locales = useMemo(() => snapshot.locales.map((file) => file.locale), [snapshot])
  const original = useMemo(
    () => Object.fromEntries(snapshot.locales.map((file) => [file.locale, file.entries])),
    [snapshot],
  )
  const [keys, setKeys] = useState(() => keysOf(snapshot))
  const [values, setValues] = useState<Record<string, FlatTranslations>>(() => structuredClone(original))

  const setValue = useCallback((locale: string, key: string, value: string) => {
    setValues((prev) => ({ ...prev, [locale]: { ...prev[locale], [key]: value } }))
  }, [])

  const addKey = useCallback(
    (rawKey: string) => {
      const key = rawKey.trim()
      if (!key || keys.includes(key)) return false
      setKeys((prev) => [...prev, key])
      return true
    },
    [keys],
  )

  const removeKey = useCallback((key: string) => {
    setKeys((prev) => prev.filter((k) => k !== key))
    setValues((prev) => {
      const next: Record<string, FlatTranslations> = {}
      for (const [locale, entries] of Object.entries(prev)) {
        const { [key]: _removed, ...rest } = entries
        next[locale] = rest
      }
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setKeys(keysOf(snapshot))
    setValues(structuredClone(original))
  }, [snapshot, original])

  const toPayload = useCallback(() => {
    const payload: Record<string, FlatTranslations> = {}
    for (const locale of locales) {
      const entries: FlatTranslations = {}
      for (const key of keys) {
        const value = values[locale]?.[key]
        if (value !== undefined && value !== '') entries[key] = value
      }
      payload[locale] = entries
    }
    return payload
  }, [locales, keys, values])

  const changes = useMemo(() => diffTranslations(original, toPayload()), [original, toPayload])

  return { locales, keys, values, original, changes, setValue, addKey, removeKey, reset, toPayload }
}
