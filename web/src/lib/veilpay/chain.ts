// Public client, cached public events, and vault transactions. Wallet connection is handled by wagmi/RainbowKit.
import { createPublicClient, erc20Abi, http, UserRejectedRequestError, type Address, type ContractFunctionArgs, type Hash, type WalletClient } from 'viem'
import { api } from '../api'
import { arcTestnet, N_OUTS, USDC, VAULT } from './config'
import { vaultAbi } from './vaultAbi'
import type { ChainEvent, OutNote } from './crypto'
import type { TransactArgs } from './prover'

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })

export const isUserRejection = (err: unknown) =>
  err instanceof UserRejectedRequestError || (err as { code?: number })?.code === 4001

// ---------- public event cache (served by /api/events, all events for everyone) ----------

type EventsResponse = {
  commitments: { idx: number; commitment: string; ciphertext: `0x${string}`; block: string }[]
  nullifiers: { nullifier: string; block: string }[]
  lastBlock: string | null
}

const cache = { events: [] as ChainEvent[], nullifiers: new Set<bigint>(), lastBlock: 0n }

let queue: Promise<unknown> = Promise.resolve()

/** Fetches events since the last call and returns the full cached view. Calls are serialized. */
export function syncEvents() {
  const run = queue.then(doSync)
  queue = run.catch(() => undefined) // a failed sync must not block later ones; callers still see the error
  return run
}

async function doSync() {
  const lastIndex = cache.events.length - 1
  const res = await api<EventsResponse>(`/events?afterIndex=${lastIndex}&afterBlock=${cache.lastBlock}`)
  for (const c of res.commitments) {
    if (c.idx !== cache.events.length) throw new Error(`event gap: expected index ${cache.events.length}, got ${c.idx}`)
    cache.events.push({ commitment: BigInt(c.commitment), index: c.idx, ciphertext: c.ciphertext, blockNumber: BigInt(c.block) })
  }
  for (const n of res.nullifiers) cache.nullifiers.add(BigInt(n.nullifier))
  if (res.lastBlock) cache.lastBlock = BigInt(res.lastBlock)
  return { events: cache.events, spent: cache.nullifiers, lastBlock: cache.lastBlock }
}

let domainTag: Promise<bigint> | undefined
export const getDomainTag = () => (domainTag ??= publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: 'domainTag' }))

export const usdcBalance = (who: Address) =>
  publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [who] })

// ---------- transactions ----------

export type ExtData = ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transact'>[7]

export function extDataFor(outs: OutNote[], recipient: Address, feeRecipient: Address): ExtData {
  if (outs.length !== N_OUTS) throw new Error(`exactly ${N_OUTS} outputs required`)
  return { recipient, feeRecipient, encryptedOutputs: outs.map((o) => o.ciphertext) as unknown as ExtData['encryptedOutputs'] }
}

export const hashExtData = (ext: ExtData) =>
  publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: 'hashExtData', args: [ext] })

async function confirm(hash: Hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`transaction reverted: ${hash}`)
  return receipt
}

/** Polls the event index until it covers `block`; the indexer's RPC node can lag behind the receipt's. */
async function waitIndexed(block: bigint, timeoutMs = 30_000) {
  const start = Date.now()
  while ((await syncEvents()).lastBlock < block) {
    if (Date.now() - start > timeoutMs) throw new Error(`event index did not reach block ${block}; refresh shortly`)
    await new Promise((r) => setTimeout(r, 1000))
  }
}

/** Approves the vault for `amount` if the current allowance is lower. */
export async function ensureAllowance(client: WalletClient, owner: Address, amount: bigint) {
  const allowance = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'allowance', args: [owner, VAULT] })
  if (allowance >= amount) return
  const hash = await client.writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [VAULT, amount], chain: arcTestnet, account: owner })
  await confirm(hash)
}

export async function sendTransact(
  client: WalletClient, account: Address, args: TransactArgs,
  amounts: { deposit: bigint; withdraw: bigint; fee: bigint }, ext: ExtData,
): Promise<Hash> {
  // simulate first so a stale root or spent note fails with the contract's reason instead of a wallet prompt
  const { request } = await publicClient.simulateContract({
    address: VAULT, abi: vaultAbi, functionName: 'transact', account,
    args: [args.proof, args.root, args.nullifier, args.outCommitments, amounts.deposit, amounts.withdraw, amounts.fee, ext],
  })
  const hash = await client.writeContract({ ...request, account })
  const receipt = await confirm(hash)
  await waitIndexed(receipt.blockNumber)
  return hash
}
