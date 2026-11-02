import { describe, expect, it } from 'vitest'
import { compilePlaceholderPattern } from './placeholders'

describe('compilePlaceholderPattern', () => {
  it('finds and fills single-brace placeholders', () => {
    const p = compilePlaceholderPattern({ pattern: '{placeholder}', examples: { count: '3', user: 'Yuki' } })
    expect(p.find('{count} items for {user}, {count} total')).toEqual(['count', 'user'])
    expect(p.fill('{count} items for {user}')).toBe('3 items for Yuki')
  })

  it('supports other delimiters and keeps names without an example', () => {
    const dollars = compilePlaceholderPattern({ pattern: '$placeholder$', examples: { PRICE: '¥1,200' } })
    expect(dollars.find('Price dropped to $PRICE$ for $ITEM$')).toEqual(['PRICE', 'ITEM'])
    expect(dollars.fill('Price dropped to $PRICE$ for $ITEM$')).toBe('Price dropped to ¥1,200 for $ITEM$')

    const mustache = compilePlaceholderPattern({ pattern: '{{placeholder}}', examples: { n: '5' } })
    expect(mustache.find('{{n}} new {{ n }}')).toEqual(['n'])
    expect(mustache.fill('{{n}} new')).toBe('5 new')

    const percent = compilePlaceholderPattern({ pattern: '%placeholder%', examples: {} })
    expect(percent.find('100% sure about %thing%')).toEqual(['thing'])
  })

  it('rejects templates without exactly one placeholder token', () => {
    expect(() => compilePlaceholderPattern({ pattern: '{}', examples: {} })).toThrow('exactly once')
    expect(() => compilePlaceholderPattern({ pattern: 'placeholder', examples: {} })).toThrow('around')
  })
})
