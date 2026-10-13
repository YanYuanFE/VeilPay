// Withdrawal relayer fee, shared by the quote (server), the proof (browser) and the acceptance check (server).

/** Gas budget quoted for one relayed transact; measured v2 payroll is ~1.6M, withdrawals add two USDC transfers. */
export const RELAY_GAS = 2_000_000n

/** Native USDC has 18 decimals; vault amounts use the 6-decimal ERC-20 unit. */
const NATIVE_PER_UNIT = 10n ** 12n

/** Fee in 6-decimal USDC that covers `gas` at `gasPrice` (wei of native USDC), rounded up. */
export function relayFee(gas: bigint, gasPrice: bigint): bigint {
  if (gas <= 0n || gasPrice <= 0n) throw new Error('gas and gasPrice must be positive')
  return (gas * gasPrice + NATIVE_PER_UNIT - 1n) / NATIVE_PER_UNIT
}
