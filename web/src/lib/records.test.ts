import { beforeAll, describe, expect, test } from 'vitest'
import { csvString, csvWithFooter, verifyCsv } from './export'
import { openingMatches, parseDisclosure, type Disclosure } from './veilpay/disclosure'
import { noteCommitment, ready, walletFromSeed } from './veilpay/crypto'

beforeAll(async () => { await ready })

describe('tamper-evident CSV', () => {
  test('escapes commas, quotes and newlines', () => {
    expect(csvString([['a,b', 'say "hi"', 'x\ny', 'plain']])).toBe('"a,b","say ""hi""","x\ny",plain')
  })

  test('footer hash verifies, and any edit breaks it', async () => {
    const csv = await csvWithFooter([['name', 'amount'], ['Alice Chen', '2000.000000'], ['Bob, Jr.', '0.000001']], { org: 'Acme Labs' })
    expect(csv.split('\n').at(-1)).toMatch(/^# veilpay-export org=Acme Labs · rows=2 · sha256=[0-9a-f]{64}$/)
    expect(await verifyCsv(csv)).toBe(true)
    expect(await verifyCsv(csv.replace('2000.000000', '2900.000000'))).toBe(false)
  })
})

describe('disclosure', () => {
  const EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
  const domain = 17003763394764819681799826706735782989507548437524573251175545328610202944287n
  const make = (amount: bigint): Disclosure => {
    const w = walletFromSeed(new Uint8Array(32).fill(9)) // after libsodium is ready
    const rho = 424242n
    return {
      v: 2, chainId: 5042002, vault: '0x8BDE9530910d448727f098A8847197146DEbeC5E', index: 17, block: '66920015',
      commitment: noteCommitment(domain, w.ownerTag, BigInt(EURC), amount, rho).toString(), ownerTag: w.ownerTag.toString(),
      asset: EURC, amount: amount.toString(), rho: rho.toString(), memo: '2026-10 salary',
    }
  }
  const encode = (d: Disclosure) => btoa(JSON.stringify(d)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  test('round-trips through a link and matches its commitment', () => {
    const d = make(3_000_000_000n)
    const parsed = parseDisclosure(`https://veilpay.example/verify#d=${encode(d)}`)
    expect(parsed.amount).toBe('3000000000')
    expect(openingMatches(parsed, domain)).toBe(true)
  })

  test('an inflated amount no longer matches the on-chain commitment', () => {
    const d = { ...make(3_000_000_000n), amount: '9000000000' }
    expect(openingMatches(d, domain)).toBe(false)
  })

  test('relabeling the asset no longer matches', () => {
    const d = { ...make(3_000_000_000n), asset: '0x3600000000000000000000000000000000000000' }
    expect(openingMatches(d, domain)).toBe(false)
  })

  test('another vault domain does not match', () => {
    expect(openingMatches(make(1n), domain + 1n)).toBe(false)
  })

  test('rejects malformed payloads', () => {
    expect(() => parseDisclosure('#d=bm90LWpzb24')).toThrow('not a VeilPay disclosure link')
    expect(() => parseDisclosure(encode({ ...make(1n), amount: (1n << 64n).toString() }))).toThrow('malformed amount')
    expect(() => parseDisclosure(encode({ ...make(1n), vault: '0x123' }))).toThrow('malformed vault address')
  })
})
