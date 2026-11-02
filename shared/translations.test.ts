import { describe, expect, it } from 'vitest'
import {
  diffTranslations,
  flatten,
  groupChangesByKey,
  mergeTranslations,
  parseTranslationFile,
  diffProject,
  serializeTranslationFile,
  slugify,
  unflatten,
} from './translations'

describe('flatten / unflatten', () => {
  it('flattens nested objects to dot-keys', () => {
    expect(flatten({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })).toEqual({ 'a.b': 'x', 'a.c.d': 'y', e: 'z' })
  })

  it('keeps non-string leaves as JSON text', () => {
    expect(flatten({ n: 1, arr: ['a', 'b'] })).toEqual({ n: '1', arr: '["a","b"]' })
  })

  it('round-trips nested files', () => {
    const text = '{\n  "a": {\n    "b": "x"\n  },\n  "c": "y"\n}\n'
    const { entries, nested } = parseTranslationFile(text)
    expect(nested).toBe(true)
    expect(serializeTranslationFile(entries, nested)).toBe(text)
  })

  it('round-trips flat files', () => {
    const text = '{\n  "a.b": "x",\n  "c": "y"\n}\n'
    const { entries, nested } = parseTranslationFile(text)
    expect(nested).toBe(false)
    expect(serializeTranslationFile(entries, nested)).toBe(text)
  })

  it('unflatten preserves insertion order', () => {
    expect(Object.keys(unflatten({ 'b.x': '1', 'a.y': '2', 'b.z': '3' }))).toEqual(['b', 'a'])
  })
})

describe('diffTranslations', () => {
  it('reports added, removed and changed keys per locale', () => {
    const before = { en: { hello: 'Hello', bye: 'Bye', same: 'Same' }, de: { hello: 'Hallo' } }
    const after = { en: { hello: 'Hi', same: 'Same', new: 'New' }, de: { hello: 'Hallo' } }
    expect(diffTranslations(before, after)).toEqual([
      { key: 'bye', locale: 'en', type: 'removed', before: 'Bye' },
      { key: 'hello', locale: 'en', type: 'changed', before: 'Hello', after: 'Hi' },
      { key: 'new', locale: 'en', type: 'added', after: 'New' },
    ])
  })

  it('treats a missing locale as empty', () => {
    expect(diffTranslations({}, { fr: { a: 'b' } })).toEqual([{ key: 'a', locale: 'fr', type: 'added', after: 'b' }])
  })

  it('groups by key', () => {
    const changes = diffTranslations({ en: { a: '1' }, de: { a: '1' } }, { en: { a: '2' }, de: { a: '2' } })
    const groups = groupChangesByKey(changes)
    expect(groups).toHaveLength(1)
    expect(groups[0].changes.map((c) => c.locale)).toEqual(['de', 'en'])
  })
})

describe('slugify', () => {
  it('makes a branch-safe slug', () => {
    expect(slugify('Fix German checkout copy!')).toBe('fix-german-checkout-copy')
    expect(slugify('   ')).toBe('update')
  })
})

describe('mergeTranslations', () => {
  const base = { en: { a: '1', b: '2', c: '3' } }

  it('takes one-sided changes from either side', () => {
    const result = mergeTranslations(base, { en: { a: '1', b: 'ours', c: '3' } }, { en: { a: 'theirs', b: '2' } })
    expect(result.conflicts).toEqual([])
    expect(result.merged).toEqual({ en: { a: 'theirs', b: 'ours' } })
  })

  it('reports keys changed differently on both sides and keeps ours', () => {
    const result = mergeTranslations(base, { en: { a: 'x', b: '2', c: '3' } }, { en: { a: 'y', b: '2', c: '3' } })
    expect(result.conflicts).toEqual([{ locale: 'en', key: 'a' }])
    expect(result.merged.en.a).toBe('x')
  })

  it('accepts identical changes on both sides', () => {
    const result = mergeTranslations(base, { en: { a: 'same' } }, { en: { a: 'same' } })
    expect(result.conflicts).toEqual([])
    expect(result.merged).toEqual({ en: { a: 'same' } })
  })
})

describe('diffProject', () => {
  it('tags field changes with field and locale changes with locale', () => {
    const before = { values: { en: { a: '1' } }, fieldValues: { description: { a: 'old' } } }
    const after = { values: { en: { a: '2' } }, fieldValues: { description: { a: 'new' } } }
    expect(diffProject(before, after)).toEqual([
      { key: 'a', locale: 'en', type: 'changed', before: '1', after: '2' },
      { key: 'a', field: 'description', type: 'changed', before: 'old', after: 'new' },
    ])
  })
})
