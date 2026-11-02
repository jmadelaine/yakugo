import { describe, expect, it } from 'vitest'
import { parseCsv, serializeCsv } from './csv'

describe('csv', () => {
  it('parses quoted cells, doubled quotes, embedded newlines and CRLF', () => {
    const text = 'key,en\r\n"a,b","He said ""hi"""\r\nc,"line1\nline2"\r\n'
    expect(parseCsv(text)).toEqual([
      ['key', 'en'],
      ['a,b', 'He said "hi"'],
      ['c', 'line1\nline2'],
    ])
  })

  it('keeps empty cells and strips a BOM', () => {
    expect(parseCsv('﻿a,,c\n,,\n')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ])
  })

  it('round-trips through serializeCsv', () => {
    const rows = [
      ['key', 'en', 'de'],
      ['x,y', 'quote " here', ''],
      ['z', 'multi\nline', ' padded '],
    ]
    expect(parseCsv(serializeCsv(rows))).toEqual(rows)
  })
})
