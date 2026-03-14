import { ConnectKitButton } from 'connectkit'
import { Link, useLocation } from 'react-router-dom'
import { Building2, User } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Header() {
  const location = useLocation()

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2">
            <img src="/favicon.png" alt="VeilPay" className="size-7" />
            <span className="text-base font-semibold tracking-tight text-foreground">
              VeilPay
            </span>
          </Link>
          <nav className="flex gap-1">
            {[
              { to: '/employer', label: 'Employer', icon: Building2 },
              { to: '/employee', label: 'Employee', icon: User },
            ].map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  location.pathname === to
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <ConnectKitButton />
      </div>
    </header>
  )
}
