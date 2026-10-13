import { describe, expect, test } from 'vitest'
import { ROSTER_MAX, parseRoster } from './roster'

describe('parseRoster', () => {
  test('CSV with header, BOM, CRLF and an optional email column', () => {
    const r = parseRoster('﻿Name,Email\r\nAlice Chen,alice@acme.dev\r\nCarol Wu\r\n')
    expect(r.errors).toEqual([])
    expect(r.rows).toEqual([
      { line: 2, name: 'Alice Chen', email: 'alice@acme.dev' },
      { line: 3, name: 'Carol Wu' },
    ])
  })

  test('quoted cells keep commas, escaped quotes and newlines', () => {
    const r = parseRoster('"Li, Bob",bob@acme.dev\n"Dana ""DJ"" Jones",\n"Eve\nSmith",eve@acme.dev\nFrank,f@acme.dev')
    expect(r.errors).toEqual([])
    expect(r.rows.map((x) => [x.line, x.name, x.email])).toEqual([
      [1, 'Li, Bob', 'bob@acme.dev'],
      [2, 'Dana "DJ" Jones', undefined],
      [3, 'Eve\nSmith', 'eve@acme.dev'],
      [5, 'Frank', 'f@acme.dev'], // the quoted newline pushed Frank to source line 5
    ])
  })

  test('tab-separated text pasted from a spreadsheet', () => {
    const r = parseRoster('name\temail\nGrace, Jr.\tgrace@acme.dev\n')
    expect(r.rows).toEqual([{ line: 2, name: 'Grace, Jr.', email: 'grace@acme.dev' }])
  })

  test('reports bad lines by source line number and keeps the good ones', () => {
    const r = parseRoster('Alice,alice@acme.dev\n,nobody@acme.dev\nBob,not-an-email\n\n' + 'x'.repeat(101))
    expect(r.rows.map((x) => x.name)).toEqual(['Alice'])
    expect(r.errors).toEqual([
      'line 2: name is missing',
      'line 3: invalid email "not-an-email"',
      'line 5: name is longer than 100 characters',
    ])
  })

  test('limit is enforced at the boundary', () => {
    const ok = parseRoster(Array.from({ length: ROSTER_MAX }, (_, i) => `P${i}`).join('\n'))
    expect([ok.rows.length, ok.errors]).toEqual([ROSTER_MAX, []])
    const over = parseRoster(Array.from({ length: ROSTER_MAX + 1 }, (_, i) => `P${i}`).join('\n'))
    expect(over.errors).toEqual([`at most ${ROSTER_MAX} people per import; this has ${ROSTER_MAX + 1}`])
  })
})
