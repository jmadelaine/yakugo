/** RFC 4180 CSV: quoted fields may hold commas, quotes (doubled) and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let i = 0
  const input = text.startsWith('﻿') ? text.slice(1) : text

  while (i < input.length) {
    const char = input[i]
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        quoted = false
        i += 1
        continue
      }
      cell += char
      i += 1
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
    i += 1
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) || value.startsWith(' ') || value.endsWith(' ') ? `"${value.replace(/"/g, '""')}"` : value
}

export function serializeCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\n') + '\n'
}
