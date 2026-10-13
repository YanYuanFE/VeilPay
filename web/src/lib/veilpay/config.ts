import { defineChain, type Address } from 'viem'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
})

export const VAULT: Address = '0x4eAC336a5d9ed20125180368888bfcc07DB1D2b3'
export const VAULT_DEPLOY_BLOCK = 66924551n
/** Outputs per transaction (circuit and vault); one is the sender's change, so N_OUTS - 1 recipients per batch. */
export const N_OUTS = 16
export const PERMIT2: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3'

/**
 * Assets on the vault's allowlist. Amounts are each token's ERC-20 units.
 * `eip3009` is the token's EIP-712 domain when it supports receiveWithAuthorization (signature-only deposits);
 * other tokens deposit through Permit2.
 */
export type Asset = { symbol: string; address: Address; decimals: number; eip3009?: { name: string; version: string } }
export const USDC: Asset = { symbol: 'USDC', address: '0x3600000000000000000000000000000000000000', decimals: 6, eip3009: { name: 'USDC', version: '2' } }
export const EURC: Asset = { symbol: 'EURC', address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', decimals: 6, eip3009: { name: 'EURC', version: '2' } }
export const ASSETS: Asset[] = [USDC, EURC]

export function assetOf(address: string): Asset {
  const a = ASSETS.find((x) => x.address.toLowerCase() === address.toLowerCase())
  if (!a) throw new Error(`unknown asset ${address}`)
  return a
}
/** Arc RPC rejects eth_getLogs spans above 10,000 blocks. */
export const LOG_SPAN = 10_000n

/**
 * Message signed to derive the VeilPay seed. Frozen: changing any byte changes every user's keys.
 * The vault named here is the first deployment; later vaults reuse the same keys (domainTag separates them).
 */
export const SEED_MESSAGE = [
  'VeilPay key derivation v1',
  `chain: ${arcTestnet.id}`,
  'vault: 0x99b143A677f49B13053Ec99C5fB16116bf0A49Ff',
  '',
  'Signing this creates your private payroll keys.',
  'Only sign it inside the VeilPay app.',
].join('\n')

export const EXPLORER = 'https://explorer.testnet.arc.io'
