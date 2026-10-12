import { cn } from 'cn'

/** VeilPay mark: a vermilion wax seal with a pressed V; the right stroke is translucent, the veil.
 *  The V stays ink-dark in both themes, like a real seal. */
const MARK_INK = '#0c121a'
export function LogoMark({ className, title = 'VeilPay' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} role="img" aria-label={title}>
      <circle cx="16" cy="16" r="15" fill="var(--seal)" />
      <circle cx="16" cy="16" r="12.4" fill="none" stroke={MARK_INK} strokeOpacity="0.28" strokeWidth="0.7" />
      <path d="M9.6 9.4 L16 22.6" stroke={MARK_INK} strokeWidth="3.4" strokeLinecap="butt" fill="none" />
      <path d="M22.4 9.4 L16 22.6" stroke={MARK_INK} strokeOpacity="0.42" strokeWidth="3.4" strokeLinecap="butt" fill="none" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="font-display text-[1.35rem] leading-none tracking-[-0.02em]">
        Veil<em className="font-display italic text-seal">Pay</em>
      </span>
    </span>
  )
}
