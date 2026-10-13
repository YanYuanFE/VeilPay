import { describe, expect, it } from 'vitest'
import { RELAY_GAS, relayFee } from './relay'

describe('relayFee', () => {
  it('converts 18-decimal gas cost to 6-decimal USDC', () => {
    // 2M gas at the 20 gwei floor = 0.04 native USDC = 40,000 units
    expect(relayFee(RELAY_GAS, 20_000_000_000n)).toBe(40_000n)
  })

  it('rounds a partial unit up so the relayer never loses dust', () => {
    expect(relayFee(1n, 1n)).toBe(1n)
    expect(relayFee(1_000_000n, 1_000_000_000_001n)).toBe(1_000_001n)
    expect(relayFee(1_000_000n, 1_000_000_000_000n)).toBe(1_000_000n)
  })

  it('rejects non-positive inputs', () => {
    expect(() => relayFee(0n, 20n)).toThrow('must be positive')
    expect(() => relayFee(RELAY_GAS, 0n)).toThrow('must be positive')
  })
})
