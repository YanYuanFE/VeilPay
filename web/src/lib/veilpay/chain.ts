// Public client, cached public events, and vault transactions. Wallet connection is handled by wagmi/RainbowKit.
import { createPublicClient, erc20Abi, http, maxUint256, parseSignature, UserRejectedRequestError, type Address, type ContractFunctionArgs, type Hash, type WalletClient } from 'viem'
import { api } from '../api'
import { arc, isAssetLoaded, N_OUTS, PERMIT2, rememberAsset, VAULT, type Asset } from './config'
import { vaultAbi } from './vaultAbi'
import type { ChainEvent, OutNote } from './crypto'
import type { TransactArgs } from './prover'

export const publicClient = createPublicClient({ chain: arc, transport: http() })

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

/** Public wallet balance in vault units (dust below one unit is dropped). */
export const tokenBalance = async (asset: Asset, who: Address) =>
  (await publicClient.readContract({ address: asset.address, abi: erc20Abi, functionName: 'balanceOf', args: [who] })) / asset.scale

// ---------- transactions ----------

export type TxArgs = ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transact'>[0]
export type ExtData = ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transact'>[1]
export type Permit2Deposit = ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transactWithPermit2'>[2]
export type Authorization = ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transactWithAuthorization'>[2]
/** How a deposit is funded: a Permit2 signature or an EIP-3009 authorization. */
export type DepositAuth = { permit: Permit2Deposit } | { authorization: Authorization }
export type Amounts = { deposit: bigint; withdraw: bigint; fee: bigint }

export function extDataFor(outs: OutNote[], recipient: Address, feeRecipient: Address): ExtData {
  if (outs.length !== N_OUTS) throw new Error(`exactly ${N_OUTS} outputs required`)
  return { recipient, feeRecipient, encryptedOutputs: outs.map((o) => o.ciphertext) as unknown as ExtData['encryptedOutputs'] }
}

export function txArgs(p: TransactArgs, asset: Address, amounts: Amounts): TxArgs {
  return {
    proof: p.proof, root: p.root, nullifier: p.nullifier, outCommitments: p.outCommitments, asset,
    depositAmount: amounts.deposit, withdrawAmount: amounts.withdraw, fee: amounts.fee,
  }
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

async function settle(hash: Hash) {
  const receipt = await confirm(hash)
  await waitIndexed(receipt.blockNumber)
  return hash
}

/** Token metadata and vault registration; `registered` is false when the vault has not seen this token yet. */
export async function readToken(address: Address) {
  const [symbol, decimals, scale] = await Promise.all([
    publicClient.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
    publicClient.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
    publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: 'assetScale', args: [address] }),
  ])
  return { symbol, decimals, registered: scale > 0n, asset: { symbol, address, decimals: 6, scale } satisfies Asset }
}

/** Loads registered vault assets so assetOf() can resolve them. */
export async function loadAssets(addresses: string[]) {
  const missing = [...new Set(addresses.map((a) => a.toLowerCase()))].filter((a) => !isAssetLoaded(a))
  await Promise.all(missing.map(async (a) => {
    const t = await readToken(a as Address)
    if (!t.registered) throw new Error(`asset ${a} is not registered on the vault`)
    rememberAsset(t.asset)
  }))
}

/** Registers `token` on the vault from the connected wallet (permissionless, once per token). */
export async function registerAsset(client: WalletClient, account: Address, token: Address) {
  const { request } = await publicClient.simulateContract({ address: VAULT, abi: vaultAbi, functionName: 'registerAsset', account, args: [token] })
  await confirm(await client.writeContract({ ...request, account }))
}

/** One-time unlimited approval of Permit2 for `asset`; each deposit is then authorized by a signature. */
export async function ensurePermit2Allowance(client: WalletClient, owner: Address, asset: Asset, amount: bigint) {
  const allowance = await publicClient.readContract({ address: asset.address, abi: erc20Abi, functionName: 'allowance', args: [owner, PERMIT2] })
  if (allowance >= amount) return
  const hash = await client.writeContract({ address: asset.address, abi: erc20Abi, functionName: 'approve', args: [PERMIT2, maxUint256], chain: arc, account: owner })
  await confirm(hash)
}

const PERMIT_TYPES = {
  PermitWitnessTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'witness', type: 'VeilPayDeposit' },
  ],
  TokenPermissions: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }],
  VeilPayDeposit: [{ name: 'outCommitments', type: `uint256[${N_OUTS}]` }, { name: 'extDataHash', type: 'uint256' }],
} as const

/** Permit2 signature letting the vault pull exactly this deposit, bound to these outputs and ext data. */
export async function signDepositPermit(client: WalletClient, owner: Address, asset: Asset, args: TxArgs, ext: ExtData): Promise<Permit2Deposit> {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(31)) // Permit2 nonces are unordered; random avoids collisions
  const nonce = BigInt(`0x${Array.from(nonceBytes, (b) => b.toString(16).padStart(2, '0')).join('')}`)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60)
  const signature = await client.signTypedData({
    account: owner,
    domain: { name: 'Permit2', chainId: arc.id, verifyingContract: PERMIT2 },
    types: PERMIT_TYPES,
    primaryType: 'PermitWitnessTransferFrom',
    message: {
      permitted: { token: args.asset, amount: args.depositAmount * asset.scale },
      spender: VAULT, nonce, deadline,
      witness: { outCommitments: args.outCommitments, extDataHash: await hashExtData(ext) },
    },
  })
  return { owner, nonce, deadline, signature }
}

/** EIP-3009 ReceiveWithAuthorization for exactly this deposit; its nonce is the vault's deposit witness. No approval needed. */
export async function signDepositAuthorization(client: WalletClient, owner: Address, asset: Asset, args: TxArgs, ext: ExtData): Promise<Authorization> {
  if (!asset.eip3009) throw new Error(`${asset.symbol} does not support EIP-3009`)
  const nonce = await publicClient.readContract({
    address: VAULT, abi: vaultAbi, functionName: 'depositWitness', args: [args.outCommitments, await hashExtData(ext)],
  })
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 30 * 60)
  const signature = await client.signTypedData({
    account: owner,
    domain: { ...asset.eip3009, chainId: arc.id, verifyingContract: asset.address },
    types: {
      ReceiveWithAuthorization: [
        { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'ReceiveWithAuthorization',
    message: { from: owner, to: VAULT, value: args.depositAmount * asset.scale, validAfter: 0n, validBefore, nonce },
  })
  const { r, s, yParity } = parseSignature(signature)
  return { from: owner, validAfter: 0n, validBefore, v: yParity + 27, r, s }
}

/** Sends from the connected wallet; a deposit is funded by the given Permit2 permit or EIP-3009 authorization. */
export async function sendTransact(client: WalletClient, account: Address, args: TxArgs, ext: ExtData, auth?: DepositAuth): Promise<Hash> {
  // simulate first so a stale root or spent note fails with the contract's reason instead of a wallet prompt
  if (auth && 'authorization' in auth) {
    const { request } = await publicClient.simulateContract({ address: VAULT, abi: vaultAbi, functionName: 'transactWithAuthorization', account, args: [args, ext, auth.authorization] })
    return settle(await client.writeContract({ ...request, account }))
  }
  if (auth) {
    const { request } = await publicClient.simulateContract({ address: VAULT, abi: vaultAbi, functionName: 'transactWithPermit2', account, args: [args, ext, auth.permit] })
    return settle(await client.writeContract({ ...request, account }))
  }
  const { request } = await publicClient.simulateContract({ address: VAULT, abi: vaultAbi, functionName: 'transact', account, args: [args, ext] })
  return settle(await client.writeContract({ ...request, account }))
}

/** Relayer quote: fee in 6-decimal USDC, paid to `address` from the transaction. The relayer only takes USDC. */
export const relayQuote = async () => {
  const q = await api<{ address: Address; fee: string }>('/relay', { credentials: 'omit' })
  return { address: q.address, fee: BigInt(q.fee) }
}

const jsonable = (v: unknown): unknown =>
  typeof v === 'bigint' ? v.toString() : Array.isArray(v) ? v.map(jsonable)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonable(x)])) : v

/** Submits through the relayer; the request carries no session cookie. */
export async function relayTransact(args: TxArgs, ext: ExtData, auth?: DepositAuth): Promise<Hash> {
  const { hash } = await api<{ hash: Hash }>('/relay', {
    method: 'POST', credentials: 'omit', body: jsonable({ args, ext, ...auth }),
  })
  return settle(hash)
}
