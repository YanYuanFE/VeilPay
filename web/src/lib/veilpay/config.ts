import { defineChain, type Address } from 'viem'

const NETWORKS = {
  mainnet: {
    chain: defineChain({
      id: 5042,
      name: 'Arc',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
    }),
    vault: '0x99b143A677f49B13053Ec99C5fB16116bf0A49Ff' as Address,
    deployBlock: 25769407n,
    eurc: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1' as Address,
    explorer: 'https://explorer.arc.io',
  },
  testnet: {
    chain: defineChain({
      id: 5042002,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
    }),
    vault: '0x72948A150498B5B1438CA7d01d07d2F51C58ef14' as Address,
    deployBlock: 67004668n,
    eurc: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as Address,
    explorer: 'https://explorer.testnet.arc.io',
  },
}

// ponytail: one build targets one network; switch here (frontend and API share this file)
const NET = NETWORKS.mainnet

export const arc = NET.chain
export const VAULT: Address = NET.vault
export const VAULT_DEPLOY_BLOCK = NET.deployBlock
export const EXPLORER = NET.explorer
/** Outputs per transaction (circuit and vault); one is the sender's change, so N_OUTS - 1 recipients per batch. */
export const N_OUTS = 16
export const PERMIT2: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3'

/**
 * A vault asset. Notes and vault amounts use 6-decimal units (`decimals`); one unit is `scale` ERC-20 units of the token
 * (10^(tokenDecimals - 6), read from the vault). Any token with 6+ decimals can be registered on the vault by anyone.
 * `eip3009` is the token's EIP-712 domain when it supports receiveWithAuthorization (signature-only deposits);
 * other tokens deposit through Permit2.
 */
export type Asset = { symbol: string; address: Address; decimals: number; scale: bigint; eip3009?: { name: string; version: string } }
export const USDC: Asset = { symbol: 'USDC', address: '0x3600000000000000000000000000000000000000', decimals: 6, scale: 1n, eip3009: { name: 'USDC', version: '2' } }
export const EURC: Asset = { symbol: 'EURC', address: NET.eurc, decimals: 6, scale: 1n, eip3009: { name: 'EURC', version: '2' } }
/** Tokens offered by default; others are loaded on demand (loadAsset in chain.ts). */
export const ASSETS: Asset[] = [USDC, EURC]

const known = new Map(ASSETS.map((a) => [a.address.toLowerCase(), a]))
export const rememberAsset = (a: Asset) => known.set(a.address.toLowerCase(), a)
export const isAssetLoaded = (address: string) => known.has(address.toLowerCase())

/** A default or already-loaded asset; call loadAssets first for arbitrary tokens. */
export function assetOf(address: string): Asset {
  const a = known.get(address.toLowerCase())
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
  'chain: 5042002',
  'vault: 0x99b143A677f49B13053Ec99C5fB16116bf0A49Ff',
  '',
  'Signing this creates your private payroll keys.',
  'Only sign it inside the VeilPay app.',
].join('\n')

