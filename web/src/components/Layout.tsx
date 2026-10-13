import { Link, NavLink, Outlet } from 'react-router'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { cn } from 'cn'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Toaster } from '@/components/ui/sonner'
import { useTheme } from '@/lib/theme'
import { useSession } from '@/lib/session'
import { arc } from '@/lib/veilpay/config'

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn('relative py-1 transition-colors hover:text-foreground', isActive && 'text-foreground after:absolute after:inset-x-0 after:-bottom-[1.15rem] after:h-px after:bg-seal')

export function Layout() {
  const { me, signedIn } = useSession()
  const { theme } = useTheme()
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-hairline bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:gap-8 sm:px-6">
          <Link to="/" aria-label="VeilPay home"><Logo /></Link>
          <nav className="flex gap-4 text-sm text-muted-foreground sm:gap-6">
            {signedIn && (
              <>
                <NavLink to="/app" end className={navClass}>Organizations</NavLink>
                <NavLink to="/me" className={navClass}>My pay</NavLink>
              </>
            )}
            <NavLink to="/verify" className={navClass}>Verify</NavLink>
            <NavLink to="/docs" className={navClass}>Docs</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-4 [&_button]:whitespace-nowrap">
            <span className="eyebrow hidden lg:inline">{arc.name}</span>
            <ThemeToggle className="hidden sm:inline-flex" />
            <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12">
        {me === null ? <p className="eyebrow">Loading…</p> : <Outlet />}
      </main>
      <Toaster richColors position="bottom-right" theme={theme} />
    </div>
  )
}

/** Page heading used by every app screen. */
export function PageTitle({ eyebrow, children, action }: { eyebrow: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-6 animate-rise">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-4xl leading-none md:text-5xl">{children}</h1>
      </div>
      {action}
    </div>
  )
}
