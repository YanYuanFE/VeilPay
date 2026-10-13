import { formatUnits, parseUnits } from 'viem'
import { toast } from 'sonner'
import { isUserRejection } from './veilpay/chain'
import type { Asset } from './veilpay/config'

/** Number only, e.g. "1,250.5". */
export const fmtNum = (x: bigint, asset: Asset) =>
  Number(formatUnits(x, asset.decimals)).toLocaleString('en-US', { maximumFractionDigits: asset.decimals })

export const fmtAmount = (x: bigint, asset: Asset) => `${fmtNum(x, asset)} ${asset.symbol}`

/** Parses a user-entered amount into the asset's units; throws on malformed or over-precise input. */
export function parseAmount(input: string, asset: Asset): bigint {
  const s = input.trim().replace(/,/g, '')
  if (!new RegExp(`^\\d+(\\.\\d{1,${asset.decimals}})?$`).test(s)) throw new Error(`invalid ${asset.symbol} amount: "${input}"`)
  return parseUnits(s, asset.decimals)
}

export const short = (s: string, head = 6, tail = 4) => (s.length > head + tail + 2 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s)

/** Toasts an error at the UI boundary; wallet rejections are shown as a cancellation. */
export function reportError(err: unknown) {
  if (isUserRejection(err)) return toast.info('Cancelled in wallet')
  const msg = err instanceof Error ? err.message : String(err)
  console.error(err)
  toast.error(msg.length > 300 ? `${msg.slice(0, 300)}…` : msg)
}
