// Targeted, off-chain disclosure of one note. The employee hands a verifier the note opening; the verifier
// re-hashes it and checks the commitment against the vault's own NewCommitment log on Arc. Nothing is published.
//
// What a valid disclosure proves: a note with exactly this asset, amount and memo was created in the vault at that block.
// What it does not prove: who issued it, that the presenter owns it (the payer also knows the opening), or whether
// it has been withdrawn since (that needs the owner's spend secret).
import { parseAbiItem } from 'viem'
import { publicClient, getDomainTag } from './chain'
import { arcTestnet, VAULT } from './config'
import { FIELD, noteCommitment, type Note, type Wallet } from './crypto'

export type Disclosure = {
  v: 2
  chainId: number
  vault: string
  index: number
  block: string
  commitment: string
  ownerTag: string
  asset: string
  amount: string
  rho: string
  memo: string
}

export function disclosureFor(w: Wallet, n: Note): Disclosure {
  return {
    v: 2, chainId: arcTestnet.id, vault: VAULT, index: n.index, block: n.blockNumber.toString(),
    commitment: n.commitment.toString(), ownerTag: w.ownerTag.toString(), asset: n.asset, amount: n.amount.toString(), rho: n.rho.toString(), memo: n.memo,
  }
}

const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))

/** The payload travels in the URL fragment, which browsers never send to a server. */
export const disclosureUrl = (d: Disclosure) => `${window.location.origin}/verify#d=${b64url(JSON.stringify(d))}`

const isDec = (v: unknown, max: bigint) => typeof v === 'string' && /^\d{1,78}$/.test(v) && BigInt(v) < max

/** Parses a disclosure link, fragment, or raw payload; throws with the first malformed field. */
export function parseDisclosure(input: string): Disclosure {
  const raw = input.trim().replace(/^.*#d=/, '')
  let d: Record<string, unknown>
  try {
    d = JSON.parse(unb64url(raw))
  } catch {
    throw new Error('not a VeilPay disclosure link')
  }
  if (d.v !== 2) throw new Error('unsupported disclosure version')
  if (!Number.isInteger(d.chainId) || !Number.isInteger(d.index) || (d.index as number) < 0) throw new Error('malformed chain id or index')
  if (typeof d.vault !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(d.vault)) throw new Error('malformed vault address')
  if (typeof d.asset !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(d.asset)) throw new Error('malformed asset')
  for (const k of ['commitment', 'ownerTag', 'rho'] as const) if (!isDec(d[k], FIELD)) throw new Error(`malformed ${k}`)
  if (!isDec(d.amount, 1n << 64n)) throw new Error('malformed amount')
  if (!isDec(d.block, 1n << 64n)) throw new Error('malformed block')
  if (typeof d.memo !== 'string' || d.memo.length > 64) throw new Error('malformed memo')
  return d as unknown as Disclosure
}

/** Pure check: does the opening hash to the stated commitment under this vault's domain? */
export const openingMatches = (d: Disclosure, domainTag: bigint) =>
  noteCommitment(domainTag, BigInt(d.ownerTag), BigInt(d.asset), BigInt(d.amount), BigInt(d.rho)) === BigInt(d.commitment)

export type Verification = {
  sameVault: boolean
  openingMatches: boolean
  onChain: boolean
  timestamp: Date | null
}

const newCommitment = parseAbiItem('event NewCommitment(uint256 indexed commitment, uint256 index, bytes encryptedOutput)')

/** Verifies against Arc directly (not the VeilPay API), so the verifier does not have to trust our server. */
export async function verifyDisclosure(d: Disclosure): Promise<Verification> {
  const sameVault = d.chainId === arcTestnet.id && d.vault.toLowerCase() === VAULT.toLowerCase()
  if (!sameVault) return { sameVault, openingMatches: false, onChain: false, timestamp: null }
  const matches = openingMatches(d, await getDomainTag())
  const block = BigInt(d.block)
  const logs = await publicClient.getLogs({ address: VAULT, event: newCommitment, args: { commitment: BigInt(d.commitment) }, fromBlock: block, toBlock: block })
  const onChain = logs.some((l) => l.args.index === BigInt(d.index))
  const timestamp = onChain ? new Date(Number((await publicClient.getBlock({ blockNumber: block })).timestamp) * 1000) : null
  return { sameVault, openingMatches: matches, onChain, timestamp }
}
