// Browser port of prover/wallet.mjs + prover/prove.mjs hashing. Must stay byte-compatible: see golden.test.ts.
//
// seed (32 bytes)
//   spendSecret = blake2b-512(key=seed, "veilpay.spend.v1") mod r
//   viewKeypair = X25519 seed keypair from blake2b-256(key=seed, "veilpay.view.v1")
// Payment address: { ownerTag = Poseidon(spendSecret), viewPub }.
// Plaintext (105 B): version(1)=1 | amount(8 BE) | rho(32) | memo(64, UTF-8, zero-padded); ciphertext = crypto_box_seal (153 B).
import sodium from 'libsodium-wrappers'
import { poseidon1, poseidon2, poseidon3, poseidon4 } from 'poseidon-lite'
import { bytesToHex, hexToBytes, keccak256, stringToBytes } from 'viem'

export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
export const LEVELS = 20
export const ZERO_LEAF = BigInt(keccak256(stringToBytes('veilpay.zero'))) % FIELD

const VERSION = 1
const MEMO_BYTES = 64
const PLAINTEXT_BYTES = 1 + 8 + 32 + MEMO_BYTES
export const CIPHERTEXT_BYTES = PLAINTEXT_BYTES + 48

export const ready = sodium.ready

export const H2 = (a: bigint, b: bigint) => poseidon2([a, b])
export const poseidonOwner = (spendSecret: bigint) => poseidon1([spendSecret])
export const noteCommitment = (domainTag: bigint, ownerTag: bigint, amount: bigint, rho: bigint) =>
  poseidon4([domainTag, ownerTag, amount, rho])
export const nullifierOf = (spendSecret: bigint, commitment: bigint) => poseidon3([1n, spendSecret, commitment])

const toBig = (b: Uint8Array) => (b.length === 0 ? 0n : BigInt(bytesToHex(b)))
function toBytes(x: bigint, n: number): Uint8Array {
  return hexToBytes(`0x${x.toString(16).padStart(n * 2, '0')}`)
}
const kdf = (seed: Uint8Array, label: string, len: number) => sodium.crypto_generichash(len, stringToBytes(label), seed)

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

/** Uniform field element (512-bit reduction keeps bias negligible). */
export const randomField = () => toBig(randomBytes(64)) % FIELD

export type PaymentAddress = { ownerTag: string; viewPub: string }

export type Wallet = {
  spendSecret: bigint
  ownerTag: bigint
  viewPub: Uint8Array
  viewPriv: Uint8Array
  address: PaymentAddress
}

export function walletFromSeed(seed: Uint8Array): Wallet {
  if (seed.length !== 32) throw new Error('seed must be 32 bytes')
  const spendSecret = toBig(kdf(seed, 'veilpay.spend.v1', 64)) % FIELD
  const view = sodium.crypto_box_seed_keypair(kdf(seed, 'veilpay.view.v1', 32))
  const ownerTag = poseidonOwner(spendSecret)
  return {
    spendSecret,
    ownerTag,
    viewPub: view.publicKey,
    viewPriv: view.privateKey,
    address: { ownerTag: ownerTag.toString(), viewPub: sodium.to_hex(view.publicKey) },
  }
}

/** Seed from a wallet signature over a fixed message (EOA signatures are deterministic). */
export function seedFromSignature(signature: `0x${string}`): Uint8Array {
  return sodium.crypto_generichash(32, hexToBytes(signature), stringToBytes('veilpay.seed.v1'))
}

export type OutNote = { ownerTag: bigint; amount: bigint; rho: bigint; ciphertext: `0x${string}` }

export function encryptNote(address: PaymentAddress, amount: bigint, memo = '', rho = randomField()): OutNote {
  if (amount < 0n || amount >= 1n << 64n) throw new Error('amount out of range')
  const memoBytes = stringToBytes(memo)
  if (memoBytes.length > MEMO_BYTES) throw new Error(`memo exceeds ${MEMO_BYTES} bytes`)
  const pt = new Uint8Array(PLAINTEXT_BYTES)
  pt[0] = VERSION
  pt.set(toBytes(amount, 8), 1)
  pt.set(toBytes(rho, 32), 9)
  pt.set(memoBytes, 41)
  const ct = sodium.crypto_box_seal(pt, sodium.from_hex(address.viewPub))
  return { ownerTag: BigInt(address.ownerTag), amount, rho, ciphertext: bytesToHex(ct) }
}

/** Zero-value output owned by nobody, same size as a real one. */
export function dummyNote(): OutNote {
  const k = sodium.crypto_box_keypair()
  return encryptNote({ ownerTag: randomField().toString(), viewPub: sodium.to_hex(k.publicKey) }, 0n)
}

/** Seals arbitrary bytes to a view key; used for the employer's own encrypted payroll records. */
export const sealTo = (viewPub: Uint8Array, data: Uint8Array) => bytesToHex(sodium.crypto_box_seal(data, viewPub))
export const openSealed = (w: Wallet, hex: `0x${string}`) => sodium.crypto_box_seal_open(hexToBytes(hex), w.viewPub, w.viewPriv)

function tryDecrypt(w: Wallet, ciphertext: `0x${string}`) {
  const ct = hexToBytes(ciphertext)
  if (ct.length !== CIPHERTEXT_BYTES) return null
  let pt: Uint8Array
  try {
    pt = sodium.crypto_box_seal_open(ct, w.viewPub, w.viewPriv)
  } catch {
    return null // not addressed to this wallet, or tampered
  }
  if (pt.length !== PLAINTEXT_BYTES || pt[0] !== VERSION) return null
  let end = PLAINTEXT_BYTES
  while (end > 41 && pt[end - 1] === 0) end--
  return { amount: toBig(pt.subarray(1, 9)), rho: toBig(pt.subarray(9, 41)), memo: new TextDecoder().decode(pt.subarray(41, end)) }
}

export type ChainEvent = { commitment: bigint; index: number; ciphertext: `0x${string}`; blockNumber: bigint }

export type Note = {
  amount: bigint
  rho: bigint
  memo: string
  index: number
  commitment: bigint
  nullifier: bigint
  blockNumber: bigint
}

/**
 * This wallet's notes, including zero-amount ones (payroll progress markers); callers filter for balances.
 * A note counts only if it re-hashes to the on-chain commitment.
 */
export function scan(w: Wallet, domainTag: bigint, events: ChainEvent[]): Note[] {
  const notes: Note[] = []
  for (const ev of events) {
    const n = tryDecrypt(w, ev.ciphertext)
    if (!n) continue
    const commitment = noteCommitment(domainTag, w.ownerTag, n.amount, n.rho)
    if (commitment !== ev.commitment) continue
    notes.push({ ...n, index: ev.index, commitment, nullifier: nullifierOf(w.spendSecret, commitment), blockNumber: ev.blockNumber })
  }
  return notes
}

/** Merkle path for leaf `index` in the depth-20 tree built from `leaves` (empty slots = zero subtrees). */
export function merklePath(leaves: bigint[], index: number) {
  let level = leaves.slice()
  let zero = ZERO_LEAF
  const siblings: bigint[] = []
  for (let i = 0; i < LEVELS; i++) {
    siblings.push(level[index ^ 1] ?? zero)
    const next: bigint[] = []
    for (let j = 0; j < level.length; j += 2) next.push(H2(level[j], level[j + 1] ?? zero))
    level = next
    zero = H2(zero, zero)
    index >>= 1
  }
  return { siblings, root: level[0] ?? zero }
}
