import { formatUnits, parseUnits } from 'viem'
import { toast } from 'sonner'
import { isUserRejection } from './veilpay/chain'
import { USDC_DECIMALS } from './veilpay/config'

export const fmtUsdc = (x: bigint) => `${Number(formatUnits(x, USDC_DECIMALS)).toLocaleString('en-US', { maximumFractionDigits: 6 })} USDC`

/** Parses a user-entered USDC amount into 6-decimal units; throws on malformed or over-precise input. */
export function parseUsdc(input: string): bigint {
  const s = input.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error(`invalid USDC amount: "${input}"`)
  return parseUnits(s, USDC_DECIMALS)
}

export const short = (s: string, head = 6, tail = 4) => (s.length > head + tail + 2 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s)

/** Toasts an error at the UI boundary; wallet rejections are shown as a cancellation. */
export function reportError(err: unknown) {
  if (isUserRejection(err)) return toast.info('Cancelled in wallet')
  const msg = err instanceof Error ? err.message : String(err)
  console.error(err)
  toast.error(msg.length > 300 ? `${msg.slice(0, 300)}…` : msg)
}
