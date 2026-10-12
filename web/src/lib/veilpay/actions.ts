// High-level VeilPay operations: deposit, withdraw, batch payroll. All proofs are generated in the browser.
import type { Address, Hash, WalletClient } from 'viem'
import { zeroAddress } from 'viem'
import { dummyNote, encryptNote, randomField, scan, type Note, type OutNote, type PaymentAddress, type Wallet } from './crypto'
import { ensureAllowance, extDataFor, getDomainTag, hashExtData, sendTransact, syncEvents } from './chain'
import { N_OUTS } from './config'

export type Stage = 'proving' | 'signing'

/** All of this wallet's notes with spent status; zero-amount notes included. */
export async function myNotes(w: Wallet): Promise<(Note & { spent: boolean })[]> {
  const [{ events, spent }, domain] = await Promise.all([syncEvents(), getDomainTag()])
  return scan(w, domain, events).map((n) => ({ ...n, spent: spent.has(n.nullifier) }))
}

export async function unspentBalance(w: Wallet) {
  const notes = (await myNotes(w)).filter((n) => !n.spent && n.amount > 0n)
  return { notes, total: notes.reduce((s, n) => s + n.amount, 0n) }
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

const padOutputs = (outs: OutNote[]) => {
  if (outs.length > N_OUTS) throw new Error(`at most ${N_OUTS} outputs`)
  return [...outs, ...Array.from({ length: N_OUTS - outs.length }, dummyNote)]
}

type Signer = { client: WalletClient; account: Address; onStage?: (s: Stage) => void }

async function transact(
  signer: Signer, spender: Wallet | null, input: Note | null, outs: OutNote[],
  amounts: { deposit: bigint; withdraw: bigint; fee: bigint }, recipient: Address = zeroAddress,
): Promise<Hash> {
  const shuffled = shuffle(padOutputs(outs))
  const ext = extDataFor(shuffled, recipient, zeroAddress)
  const [extDataHash, domainTag, { events }] = await Promise.all([hashExtData(ext), getDomainTag(), syncEvents()])
  signer.onStage?.('proving')
  const { prove } = await import('./prover') // snarkjs is ~1.5 MB; load it only when proving
  const args = await prove({
    domainTag, extDataHash, depositAmount: amounts.deposit, withdrawAmount: amounts.withdraw, fee: amounts.fee,
    leaves: events.map((e) => e.commitment),
    input: spender && input
      ? { spendSecret: spender.spendSecret, amount: input.amount, rho: input.rho, index: input.index }
      : { spendSecret: randomField(), amount: 0n, rho: 0n, index: 0 },
    outs: shuffled,
  })
  signer.onStage?.('signing')
  return sendTransact(signer.client, signer.account, args, amounts, ext)
}

/** Moves public USDC from the connected wallet into a private note owned by `w`. */
export async function deposit(signer: Signer, w: Wallet, amount: bigint, memo = 'deposit') {
  if (amount <= 0n) throw new Error('amount must be positive')
  await ensureAllowance(signer.client, signer.account, amount)
  return transact(signer, null, null, [encryptNote(w.address, amount, memo)], { deposit: amount, withdraw: 0n, fee: 0n })
}

/** Spends one note: `amount` goes to `recipient` publicly, the rest stays private as change. */
export async function withdraw(signer: Signer, w: Wallet, note: Note, amount: bigint, recipient: Address) {
  if (amount <= 0n || amount > note.amount) throw new Error('amount must be between 0 and the note value')
  const change = note.amount - amount
  const outs = change > 0n ? [encryptNote(w.address, change, 'change')] : []
  return transact(signer, w, note, outs, { deposit: 0n, withdraw: amount, fee: 0n }, recipient)
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

/**
 * Pays `lines` in ceil(n / PER_TX) transactions. Chunk k spends the previous change note and emits a change note
 * with memo `run:<runId>:<k>` (zero-amount included), so progress is recovered from the chain alone:
 * a retry resumes after the highest chunk marker and can never pay a chunk twice (its input is single-use).
 */
export async function runPayroll(
  signer: Signer, employer: Wallet, runId: string, lines: PayLine[],
  onChunk: (k: number, total: number, hash: Hash) => Promise<void> | void,
  onStart?: (firstChunk: number, total: number) => void,
) {
  if (lines.length === 0) throw new Error('no payroll lines')
  for (const l of lines) if (l.amount <= 0n) throw new Error(`amount for ${l.name} must be positive`)
  const chunks = chunkLines(lines)
  const sum = (ls: PayLine[]) => ls.reduce((s, l) => s + l.amount, 0n)

  const notes = await myNotes(employer)
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
    if (candidates.length === 0) throw new Error('no single treasury note covers this payroll; deposit first')
    input = candidates[0]
  }

  onStart?.(start, chunks.length)
  for (let k = start; k < chunks.length; k++) {
    const chunk = chunks[k]
    const change = input.amount - sum(chunk)
    if (change < 0n) throw new Error(`treasury note too small at chunk ${k}`)
    const outs = [
      ...chunk.map((l) => encryptNote(l.address, l.amount, l.memo)),
      encryptNote(employer.address, change, runMemo(runId, k)),
    ]
    const hash = await transact(signer, employer, input, outs, { deposit: 0n, withdraw: 0n, fee: 0n })
    await onChunk(k, chunks.length, hash)
    if (k < chunks.length - 1) {
      const next = (await myNotes(employer)).find((n) => n.memo === runMemo(runId, k) && !n.spent)
      if (!next) throw new Error(`change note for chunk ${k} not found after confirmation`)
      input = next
    }
  }
  return { resumedFrom: start, done: true }
}
