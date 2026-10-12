import { defineChain, type Address } from 'viem'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
})

export const VAULT: Address = '0x206b534BF9025AFc7B31f18639aE5DeA07dbf5Bb'
export const VAULT_DEPLOY_BLOCK = 66832820n
/** Outputs per transaction (circuit and vault); one is the sender's change, so N_OUTS - 1 recipients per batch. */
export const N_OUTS = 16
export const USDC: Address = '0x3600000000000000000000000000000000000000'
/** USDC ERC-20 view has 6 decimals; all VeilPay amounts use this unit. */
export const USDC_DECIMALS = 6
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
