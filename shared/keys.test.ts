import { describe, expect, it } from 'vitest'
import { validateKey } from './keys'

describe('validateKey', () => {
  const existing = ['nav.home']

  it('accepts well-formed new keys', () => {
    expect(validateKey('nav.products', existing)).toBeUndefined()
    expect(validateKey('welcome_body', existing)).toBeUndefined()
    expect(validateKey('a-b.c_d.e', existing)).toBeUndefined()
  })

  it('rejects empty, whitespace and duplicates', () => {
    expect(validateKey('', existing)).toBe('Enter a key')
    expect(validateKey('nav home', existing)).toMatch(/whitespace/)
    expect(validateKey('nav\thome', existing)).toMatch(/whitespace/)
    expect(validateKey('nav.home', existing)).toBe('This key already exists')
  })
})
