import { beforeAll, describe, expect, test } from 'vitest'
import { getAddress, hexToBytes } from 'viem'
import golden from './golden.json'
import {
  CIPHERTEXT_BYTES, H2, ZERO_LEAF, dummyNote, encryptNote, merklePath, noteCommitment, nullifierOf, ready, scan,
  seedFromSignature, walletFromSeed,
} from './crypto'

// Empty-tree root read from the Arc testnet vaults (v1 0x99b1…49Ff, v3 0x8BDE…eC5E) at deployment.
const ONCHAIN_EMPTY_ROOT = 19664536260766957895063884415716100155779300891958589139390157619038028147520n

beforeAll(async () => { await ready })

describe('golden vectors from prover/golden.mjs (Node)', () => {
  test('key derivation matches', () => {
    const w = walletFromSeed(hexToBytes(`0x${golden.seedHex}`))
    expect(w.spendSecret.toString()).toBe(golden.spendSecret)
    expect(w.ownerTag.toString()).toBe(golden.ownerTag)
    expect(w.address.viewPub).toBe(golden.viewPub)
  })

  test('hashes match', () => {
    const w = walletFromSeed(hexToBytes(`0x${golden.seedHex}`))
    const c = noteCommitment(BigInt(golden.domainTag), w.ownerTag, BigInt(golden.asset), BigInt(golden.amount), BigInt(golden.rho))
    expect(c.toString()).toBe(golden.commitment)
    expect(nullifierOf(w.spendSecret, c).toString()).toBe(golden.nullifier)
    expect(ZERO_LEAF.toString()).toBe(golden.zeroLeaf)
    expect(H2(1n, 2n).toString()).toBe(golden.h12)
  })

  test('decrypts a ciphertext produced by Node', () => {
    const w = walletFromSeed(hexToBytes(`0x${golden.seedHex}`))
    const ev = { commitment: BigInt(golden.commitment), index: 3, ciphertext: golden.ciphertext as `0x${string}`, blockNumber: 1n }
    const [n] = scan(w, BigInt(golden.domainTag), [ev])
    expect(n.asset).toBe(getAddress(golden.asset))
    expect(n.amount.toString()).toBe(golden.amount)
    expect(n.rho.toString()).toBe(golden.rho)
    expect(n.memo).toBe(golden.memo)
    expect(n.nullifier.toString()).toBe(golden.nullifier)
  })

  test('empty tree root equals on-chain vault root', () => {
    expect(merklePath([], 0).root).toBe(ONCHAIN_EMPTY_ROOT)
  })
})

describe('browser-side rules', () => {
  const domain = BigInt(golden.domainTag)
  const USDC = '0x3600000000000000000000000000000000000000' as const
  const EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const
  test('only the recipient sees the note; fixed ciphertext size', () => {
    const a = walletFromSeed(new Uint8Array(32).fill(1))
    const b = walletFromSeed(new Uint8Array(32).fill(2))
    const n = encryptNote(a.address, USDC, 2_000_000n, '2026-10 salary')
    const ev = { commitment: noteCommitment(domain, n.ownerTag, n.asset, n.amount, n.rho), index: 0, ciphertext: n.ciphertext, blockNumber: 1n }
    expect(scan(a, domain, [ev]).map((x) => x.amount)).toEqual([2_000_000n])
    expect(scan(b, domain, [ev])).toEqual([])
    expect((n.ciphertext.length - 2) / 2).toBe(CIPHERTEXT_BYTES)
    expect((dummyNote(USDC).ciphertext.length - 2) / 2).toBe(CIPHERTEXT_BYTES)
    expect(CIPHERTEXT_BYTES).toBe(173)
  })

  test('asset is recovered and bound into the commitment', () => {
    const a = walletFromSeed(new Uint8Array(32).fill(1))
    const n = encryptNote(a.address, EURC, 5_000_000n, 'eur')
    const ev = { commitment: noteCommitment(domain, n.ownerTag, n.asset, n.amount, n.rho), index: 0, ciphertext: n.ciphertext, blockNumber: 1n }
    expect(scan(a, domain, [ev]).map((x) => x.asset)).toEqual([EURC])
    const asUsdc = { ...ev, commitment: noteCommitment(domain, n.ownerTag, BigInt(USDC), n.amount, n.rho) }
    expect(scan(a, domain, [asUsdc])).toEqual([])
  })

  test('seed from signature is deterministic and signature-specific', () => {
    const s1 = seedFromSignature(`0x${'ab'.repeat(65)}`)
    expect(seedFromSignature(`0x${'ab'.repeat(65)}`)).toEqual(s1)
    expect(seedFromSignature(`0x${'ac'.repeat(65)}`)).not.toEqual(s1)
    expect(s1.length).toBe(32)
  })
})
