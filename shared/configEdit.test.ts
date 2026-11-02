import { describe, expect, it } from 'vitest'
import { parseConfig } from './config'
import { updatePlaceholderExamples } from './configEdit'

const text = `# Yakugo config
sourceLocale: en

projects:
  # First project
  - name: Web app
    path: web
    placeholders:
      pattern: "{placeholder}"
      examples:
        count: 3        # items in cart
        userName: Yuki
  - name: Other
    path: other
`

describe('updatePlaceholderExamples', () => {
  it('edits, adds and removes examples while keeping comments and other content', () => {
    const next = updatePlaceholderExamples(text, 'Web app', { count: '5', city: 'Osaka' })
    expect(next).toContain('# Yakugo config')
    expect(next).toContain('# First project')
    expect(next).toMatch(/count: 5 +# items in cart/)
    expect(next).toContain('city: Osaka')
    expect(next).not.toContain('userName')
    expect(next).toContain('- name: Other\n    path: other')
    const config = parseConfig(next, { files: '{locale}.json', sourceLocale: 'en' })
    expect(config.projects[0].placeholders?.examples).toEqual({ count: '5', city: 'Osaka' })
  })

  it('returns the same text when nothing changes', () => {
    expect(updatePlaceholderExamples(text, 'Web app', { count: '3', userName: 'Yuki' })).toBe(text)
  })

  it('creates the examples map when missing', () => {
    const noExamples = text.replace(/\n      examples:[\s\S]*?userName: Yuki/, '')
    const next = updatePlaceholderExamples(noExamples, 'Web app', { count: '1' })
    expect(next).toContain('examples:\n        count: 1')
  })

  it('refuses projects without a placeholders section', () => {
    expect(() => updatePlaceholderExamples(text, 'Other', { a: '1' })).toThrow('no placeholders section')
    expect(() => updatePlaceholderExamples(text, 'Missing', {})).toThrow('not found')
  })
})
