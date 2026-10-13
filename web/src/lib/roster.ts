// Member roster import: CSV (RFC 4180 quoting) or tab-separated text pasted from a spreadsheet.
// Columns: name, email (optional). A first row whose first cell is "name" is treated as a header.

/** Matches the API's per-request limit (MAX_BATCH in api/index.ts). */
export const ROSTER_MAX = 500

export type RosterRow = { line: number; name: string; email?: string }
export type Roster = { rows: RosterRow[]; errors: string[] }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Splits delimited text into rows of cells; quoted cells may contain the delimiter, quotes ("") and newlines. */
function cells(text: string, delim: string): { line: number; cells: string[] }[] {
  const out: { line: number; cells: string[] }[] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let start = 1
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else { if (c === '\n') line++; field += c }
    } else if (c === '"' && field.trim() === '') { quoted = true; field = '' }
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      out.push({ line: start, cells: row })
      row = []
      field = ''
      start = ++line
    } else field += c
  }
  row.push(field)
  out.push({ line: start, cells: row })
  return out
}

export function parseRoster(text: string): Roster {
  const src = text.replace(/^﻿/, '')
  const delim = src.includes('\t') ? '\t' : ','
  const lines = cells(src, delim).filter((r) => r.cells.some((c) => c.trim()))
  if (lines.length > 0 && lines[0].cells[0].trim().toLowerCase() === 'name') lines.shift()

  const rows: RosterRow[] = []
  const errors: string[] = []
  for (const { line, cells: [rawName = '', rawEmail = ''] } of lines) {
    const name = rawName.trim()
    const email = rawEmail.trim()
    if (!name) errors.push(`line ${line}: name is missing`)
    else if (name.length > 100) errors.push(`line ${line}: name is longer than 100 characters`)
    else if (email && !EMAIL.test(email)) errors.push(`line ${line}: invalid email "${email}"`)
    else rows.push({ line, name, ...(email ? { email } : {}) })
  }
  if (rows.length > ROSTER_MAX) errors.push(`at most ${ROSTER_MAX} people per import; this has ${rows.length}`)
  return { rows, errors }
}
