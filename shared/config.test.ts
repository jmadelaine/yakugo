import { describe, expect, it } from 'vitest'
import { compilePattern, defaultConfig, parseConfig, projectFiles } from './config'

const defaults = { files: '{locale}.json', sourceLocale: 'en' }

describe('parseConfig', () => {
  it('reads a list of projects with per-project overrides', () => {
    const text = `
sourceLocale: ja
projects:
  - name: Web app
    path: apps/web/locales
  - name: Mobile
    path: /apps/mobile/i18n/
    files: "{locale}/strings.json"
    sourceLocale: en
`
    const base = { format: 'json', records: '', fields: { $key: '.', $value: '.' }, customFields: [] }
    expect(parseConfig(text, defaults)).toEqual({
      projects: [
        { ...base, id: 'web-app', name: 'Web app', path: 'apps/web/locales', files: '{locale}.json', sourceLocale: 'ja' },
        { ...base, id: 'mobile', name: 'Mobile', path: 'apps/mobile/i18n', files: '{locale}/strings.json', sourceLocale: 'en' },
      ],
    })
  })

  it('allows a project at the repo root', () => {
    const config = parseConfig('projects:\n  - name: Root\n    path: .\n', defaults)
    expect(config.projects[0].path).toBe('')
    const files = projectFiles(config.projects[0])
    expect(files.kind === 'perLocale' && files.pattern.pathFor('de')).toBe('de.json')
  })

  it('rejects bad shapes', () => {
    expect(() => parseConfig('- a\n', defaults)).toThrow('mapping')
    expect(() => parseConfig('', defaults)).toThrow('projects')
    expect(() => parseConfig('projects: []\n', defaults)).toThrow('projects')
    expect(() => parseConfig('projects:\n  - path: x\n', defaults)).toThrow('needs a name')
    expect(() => parseConfig('projects:\n  - name: A\n    path: ../x\n', defaults)).toThrow('dot segments')
    expect(() => parseConfig('projects:\n  - name: A\n    files: en.json\n', defaults)).toThrow('{locale}')
    expect(() => parseConfig('projects:\n  - name: A\n  - name: a\n', defaults)).toThrow('share the id')
    expect(() => parseConfig('projects:\n  - name: A\n    sourceLocale: "a/b"\n', defaults)).toThrow('sourceLocale')
  })

  it('infers format and layout, and validates {locale} placement', () => {
    const csv = parseConfig('projects:\n  - name: A\n    files: all.csv\n', defaults).projects[0]
    expect(csv.format).toBe('csv')
    expect(csv.fields).toEqual({ $key: 'key', $value: '{locale}' })
    const perLocaleCsv = parseConfig('projects:\n  - name: A\n    files: "{locale}.csv"\n', defaults).projects[0]
    expect(perLocaleCsv.fields).toEqual({ $key: 'key', $value: 'value' })
    const wideJson = parseConfig('projects:\n  - name: A\n    files: all.json\n    fields:\n      $value: "{locale}"\n      note: comment\n', defaults).projects[0]
    expect(wideJson.customFields).toEqual(['note'])
    expect(projectFiles(wideJson)).toEqual({ kind: 'single', path: 'all.json' })
    expect(() => parseConfig('projects:\n  - name: A\n    files: all.json\n', defaults)).toThrow('{locale} must appear')
    // Per-locale files whose value column is named after the locale.
    const both = parseConfig('projects:\n  - name: A\n    files: "{locale}.csv"\n    fields:\n      $value: "{locale}"\n', defaults).projects[0]
    expect(both.fields.$value).toBe('{locale}')
    expect(() => parseConfig('projects:\n  - name: A\n    files: all.json\n    fields:\n      $value: "{locale}"\n      note: "{locale}.x"\n', defaults)).toThrow('only the value path')
    expect(() => parseConfig('projects:\n  - name: A\n    files: x.json\n    format: xml\n', defaults)).toThrow('json or csv')
  })

  it('reserves $ for built-in fields and leaves key and value free as custom names', () => {
    const custom = parseConfig('projects:\n  - name: A\n    files: "{locale}.csv"\n    fields:\n      $key: id\n      $value: text\n      key: legacy_key\n      value: notes\n', defaults).projects[0]
    expect(custom.fields).toEqual({ $key: 'id', $value: 'text', key: 'legacy_key', value: 'notes' })
    expect(custom.customFields).toEqual(['key', 'value'])
    expect(() => parseConfig('projects:\n  - name: A\n    files: "{locale}.csv"\n    fields:\n      $id: id\n', defaults)).toThrow('unknown built-in field "$id"')
  })
})

describe('placeholders', () => {
  it('reads pattern and examples, coercing example values to strings', () => {
    const text = 'projects:\n  - name: A\n    placeholders:\n      pattern: "{placeholder}"\n      examples:\n        count: 3\n        user: Yuki\n'
    expect(parseConfig(text, defaults).projects[0].placeholders).toEqual({ pattern: '{placeholder}', examples: { count: '3', user: 'Yuki' } })
  })

  it('rejects a pattern without the placeholder token', () => {
    expect(() => parseConfig('projects:\n  - name: A\n    placeholders:\n      pattern: "{}"\n', defaults)).toThrow('exactly once')
    expect(() => parseConfig('projects:\n  - name: A\n    placeholders: {}\n', defaults)).toThrow('pattern is required')
  })
})

describe('defaultConfig', () => {
  it('builds one project at the given path', () => {
    const config = defaultConfig('locales', defaults)
    expect(config.projects).toHaveLength(1)
    const files = projectFiles(config.projects[0])
    expect(files.kind === 'perLocale' && files.pattern.pathFor('de')).toBe('locales/de.json')
  })
})

describe('compilePattern', () => {
  it('handles {locale} in the file name', () => {
    const p = compilePattern('locales/{locale}.json')
    expect(p.dir).toBe('locales')
    expect(p.suffix).toBe('')
    expect(p.localeFromEntry('de.json')).toBe('de')
    expect(p.localeFromEntry('README.md')).toBeUndefined()
    expect(p.localeFromPath('locales/pt-BR.json')).toBe('pt-BR')
    expect(p.localeFromPath('locales/sub/de.json')).toBeUndefined()
    expect(p.localeFromPath('other/de.json')).toBeUndefined()
    expect(p.pathFor('fr')).toBe('locales/fr.json')
  })

  it('handles {locale} as a directory', () => {
    const p = compilePattern('public/locales/{locale}/translation.json')
    expect(p.dir).toBe('public/locales')
    expect(p.suffix).toBe('translation.json')
    expect(p.localeFromEntry('de')).toBe('de')
    expect(p.localeFromPath('public/locales/de/translation.json')).toBe('de')
    expect(p.localeFromPath('public/locales/de/other.json')).toBeUndefined()
    expect(p.pathFor('ja')).toBe('public/locales/ja/translation.json')
  })

  it('handles a prefix in the segment and the repo root', () => {
    const p = compilePattern('messages.{locale}.json')
    expect(p.dir).toBe('')
    expect(p.localeFromPath('messages.en-US.json')).toBe('en-US')
    expect(p.pathFor('de')).toBe('messages.de.json')
  })

  it('rejects unsafe locale names in pathFor', () => {
    expect(() => compilePattern('locales/{locale}.json').pathFor('../x')).toThrow('Invalid locale name')
  })
})
