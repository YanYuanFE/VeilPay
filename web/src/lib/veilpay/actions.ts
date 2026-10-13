// High-level VeilPay operations: deposit, withdraw, batch payroll. All proofs are generated in the browser.
// Every transaction moves one asset; USDC goes through the relayer, other assets are sent from the user's wallet.
import type { Address, Hash, WalletClient } from 'viem'
import { zeroAddress } from 'viem'
import { dummyNote, encryptNote, randomField, scan, type Note, type OutNote, type PaymentAddress, type Wallet } from './crypto'
import {
  ensurePermit2Allowance, extDataFor, getDomainTag, hashExtData, relayQuote, relayTransact, sendTransact, signDepositAuthorization,
  signDepositPermit, syncEvents, txArgs, type Amounts, type DepositAuth,
} from './chain'
import { assetOf, N_OUTS, USDC, type Asset } from './config'

export type Stage = 'proving' | 'signing' | 'relaying'

/** All of this wallet's notes with spent status; zero-amount notes included. */
export async function myNotes(w: Wallet): Promise<(Note & { spent: boolean })[]> {
  const [{ events, spent }, domain] = await Promise.all([syncEvents(), getDomainTag()])
  return scan(w, domain, events).map((n) => ({ ...n, spent: spent.has(n.nullifier) }))
}

const sameAsset = (a: Address, b: Asset) => a.toLowerCase() === b.address.toLowerCase()

/** Unspent, non-zero notes of one asset. */
export async function unspentBalance(w: Wallet, asset: Asset) {
  const notes = (await myNotes(w)).filter((n) => !n.spent && n.amount > 0n && sameAsset(n.asset, asset))
  return { notes, total: notes.reduce((s, n) => s + n.amount, 0n), largest: notes.reduce((m, n) => (n.amount > m ? n.amount : m), 0n) }
}

/** Fisher-Yates with a CSPRNG so the position of real outputs does not leak. */
function shuffle<T>(xs: T[]): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const r = new Uint32Array(1)
    crypto.getRandomValues(r)
    const j = r[0] % (i + 1) // ponytail: modulo bias is < 2^-27 for i < 16
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const padOutputs = (outs: OutNote[], asset: Address) => {
  if (outs.length > N_OUTS) throw new Error(`at most ${N_OUTS} outputs`)
  return [...outs, ...Array.from({ length: N_OUTS - outs.length }, () => dummyNote(asset))]
}

type Signer = { client: WalletClient; account: Address; onStage?: (s: Stage) => void }

/** Proves one transaction of `asset`; the public asset is revealed only when value enters or leaves. */
async function proveTransact(
  spender: Wallet | null, input: Note | null, outs: OutNote[], asset: Asset, amounts: Amounts,
  recipient: Address, feeRecipient: Address, onStage?: (s: Stage) => void,
) {
  const shuffled = shuffle(padOutputs(outs, asset.address))
  const ext = extDataFor(shuffled, recipient, feeRecipient)
  const [extDataHash, domainTag, { events }] = await Promise.all([hashExtData(ext), getDomainTag(), syncEvents()])
  const moves = amounts.deposit > 0n || amounts.withdraw > 0n || amounts.fee > 0n
  const publicAsset = moves ? asset.address : zeroAddress
  onStage?.('proving')
  const { prove } = await import('./prover') // snarkjs is ~1.5 MB; load it only when proving
  const proof = await prove({
    domainTag, extDataHash, depositAmount: amounts.deposit, withdrawAmount: amounts.withdraw, fee: amounts.fee,
    asset: BigInt(publicAsset), noteAsset: BigInt(asset.address),
    leaves: events.map((e) => e.commitment),
    input: spender && input
      ? { spendSecret: spender.spendSecret, amount: input.amount, rho: input.rho, index: input.index }
      : { spendSecret: randomField(), amount: 0n, rho: 0n, index: 0 },
    outs: shuffled,
  })
  return { args: txArgs(proof, publicAsset, amounts), ext }
}

/**
 * Moves public `asset` from the connected wallet into a private note owned by `w`. Funded by an EIP-3009 signature
 * when the token supports it (no approval at all), otherwise by Permit2 after a one-time approval.
 * USDC is submitted by the relayer (its fee comes out of the deposit); other assets are sent from the wallet.
 */
export async function deposit(signer: Signer, w: Wallet, asset: Asset, amount: bigint, memo = 'deposit') {
  if (amount <= 0n) throw new Error('amount must be positive')
  if (!asset.eip3009) await ensurePermit2Allowance(signer.client, signer.account, asset, amount * asset.scale)
  const quote = asset === USDC ? await relayQuote() : null
  const fee = quote?.fee ?? 0n
  if (amount <= fee) throw new Error('amount must exceed the relayer fee')
  const { args, ext } = await proveTransact(null, null, [encryptNote(w.address, asset.address, amount - fee, memo)], asset,
    { deposit: amount, withdraw: 0n, fee }, zeroAddress, quote?.address ?? zeroAddress, signer.onStage)
  signer.onStage?.('signing')
  const auth: DepositAuth = asset.eip3009
    ? { authorization: await signDepositAuthorization(signer.client, signer.account, asset, args, ext) }
    : { permit: await signDepositPermit(signer.client, signer.account, asset, args, ext) }
  if (!quote) return sendTransact(signer.client, signer.account, args, ext, auth)
  signer.onStage?.('relaying')
  return relayTransact(args, ext, auth)
}

export type WithdrawRoute = { relayer: { address: Address; fee: bigint } } | { signer: Signer }

/**
 * Spends one note: `amount` goes to `recipient` publicly, the rest stays private as change.
 * Via the relayer (USDC only) its fee also comes out of the note and the relayer is the on-chain sender.
 */
export async function withdraw(w: Wallet, note: Note, amount: bigint, recipient: Address, route: WithdrawRoute, onStage?: (s: Stage) => void) {
  const asset = assetOf(note.asset)
  const relayed = 'relayer' in route
  if (relayed && asset !== USDC) throw new Error('the relayer only accepts USDC notes')
  const fee = relayed ? route.relayer.fee : 0n
  if (amount <= 0n || amount + fee > note.amount) throw new Error('amount plus fee must not exceed the note value')
  const change = note.amount - amount - fee
  const outs = change > 0n ? [encryptNote(w.address, note.asset, change, 'change')] : []
  const amounts = { deposit: 0n, withdraw: amount, fee }
  const feeTo = relayed ? route.relayer.address : zeroAddress
  const { args, ext } = await proveTransact(w, note, outs, asset, amounts, recipient, feeTo, onStage)
  if (relayed) {
    onStage?.('relaying')
    return relayTransact(args, ext)
  }
  onStage?.('signing')
  return sendTransact(route.signer.client, route.signer.account, args, ext)
}

// ---------- batch payroll ----------

export type PayLine = { memberId: string; name: string; address: PaymentAddress; amount: bigint; memo: string }
export const PER_TX = N_OUTS - 1 // one output is the employer's change

const runMemo = (runId: string, chunk: number) => `run:${runId}:${chunk}`

export function chunkLines(lines: PayLine[]) {
  const chunks: PayLine[][] = []
  for (let i = 0; i < lines.length; i += PER_TX) chunks.push(lines.slice(i, i + PER_TX))
  return chunks
}

/** One payroll transaction from the connected wallet: no public value moves, so the asset stays hidden. */
async function payTransact(signer: Signer, employer: Wallet, input: Note, outs: OutNote[], asset: Asset): Promise<Hash> {
  const { args, ext } = await proveTransact(employer, input, outs, asset, { deposit: 0n, withdraw: 0n, fee: 0n }, zeroAddress, zeroAddress, signer.onStage)
  signer.onStage?.('signing')
  return sendTransact(signer.client, signer.account, args, ext)
}

/**
 * Pays `lines` in `asset` in ceil(n / PER_TX) transactions. Chunk k spends the previous change note and emits a change note
 * with memo `run:<runId>:<k>` (zero-amount included), so progress is recovered from the chain alone:
 * a retry resumes after the highest chunk marker and can never pay a chunk twice (its input is single-use).
 */
export async function runPayroll(
  signer: Signer, employer: Wallet, runId: string, lines: PayLine[], asset: Asset,
  onChunk: (k: number, total: number, hash: Hash) => Promise<void> | void,
  onStart?: (firstChunk: number, total: number) => void,
) {
  if (lines.length === 0) throw new Error('no payroll lines')
  for (const l of lines) if (l.amount <= 0n) throw new Error(`amount for ${l.name} must be positive`)
  const chunks = chunkLines(lines)
  const sum = (ls: PayLine[]) => ls.reduce((s, l) => s + l.amount, 0n)

  const notes = (await myNotes(employer)).filter((n) => sameAsset(n.asset, asset))
  const markers = notes
    .filter((n) => n.memo.startsWith(`run:${runId}:`))
    .map((n) => ({ note: n, k: Number(n.memo.split(':')[2]) }))
    .sort((a, b) => b.k - a.k)
  let start = 0
  let input: Note
  if (markers.length > 0) {
    const last = markers[0]
    if (last.k >= chunks.length - 1) return { resumedFrom: chunks.length, done: true }
    if (last.note.spent) throw new Error(`run marker for chunk ${last.k} is already spent outside this run`)
    start = last.k + 1
    input = last.note
  } else {
    const need = sum(lines)
    // deterministic choice (smallest sufficient, then lowest index) so concurrent tabs collide on one nullifier
    const candidates = notes
      .filter((n) => !n.spent && n.amount >= need)
      .sort((a, b) => (a.amount === b.amount ? a.index - b.index : a.amount < b.amount ? -1 : 1))
    if (candidates.length === 0) throw new Error(`no single ${asset.symbol} treasury note covers this payroll; deposit first`)
    input = candidates[0]
  }

  onStart?.(start, chunks.length)
  for (let k = start; k < chunks.length; k++) {
    const chunk = chunks[k]
    const change = input.amount - sum(chunk)
    if (change < 0n) throw new Error(`treasury note too small at chunk ${k}`)
    const outs = [
      ...chunk.map((l) => encryptNote(l.address, asset.address, l.amount, l.memo)),
      encryptNote(employer.address, asset.address, change, runMemo(runId, k)),
    ]
    const hash = await payTransact(signer, employer, input, outs, asset)
    await onChunk(k, chunks.length, hash)
    if (k < chunks.length - 1) {
      const next = (await myNotes(employer)).find((n) => n.memo === runMemo(runId, k) && !n.spent && sameAsset(n.asset, asset))
      if (!next) throw new Error(`change note for chunk ${k} not found after confirmation`)
      input = next
    }
  }
  return { resumedFrom: start, done: true }
}
