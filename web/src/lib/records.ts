// Org data shapes from the API, plus JSON blobs sealed to the employer's view key (server stores ciphertext only).
import { openSealed, sealTo, type Wallet } from './veilpay/crypto'
import type { Stage } from './veilpay/actions'

export type Member = {
  id: string; name: string; email: string | null; invite_code: string
  wallet_address: string | null; owner_tag: string | null; view_pub: string | null; joined_at: string | null
}
export type OrgData = {
  org: { id: string; name: string; owner_tag: string; view_pub: string; salary_book: `0x${string}` | null }
  members: Member[]
}
export type Run = { id: string; status: string; recipients: number; sealed: `0x${string}`; created_at: string }
export type RunLine = { memberId: string; name: string; amount: string; memo: string }
/** `kind` is absent on records written before one-off payments existed; those were salary runs. */
export type RunRecord = { v: 1; kind?: 'salary' | 'bonus'; lines: RunLine[]; txs: string[] }
/** memberId → default amount in 6-decimal units. */
export type SalaryBook = Record<string, string>

export const sealJson = (w: Wallet, value: unknown) => sealTo(w.viewPub, new TextEncoder().encode(JSON.stringify(value)))
export const openJson = <T,>(w: Wallet, hex: `0x${string}`) => JSON.parse(new TextDecoder().decode(openSealed(w, hex))) as T

export const stageText: Record<Stage, string> = { proving: 'Generating proof in your browser…', signing: 'Confirm in your wallet…' }
