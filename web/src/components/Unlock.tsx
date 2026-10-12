import { useState, type ReactNode } from 'react'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { reportError } from '@/lib/format'
import { useSession } from '@/lib/session'
import type { Wallet } from '@/lib/veilpay/crypto'

/** Renders children only once VeilPay keys are derived from the wallet signature. */
export function RequireKeys({ children, purpose }: { children: (w: Wallet) => ReactNode; purpose: string }) {
  const { veil, unlock } = useSession()
  const [busy, setBusy] = useState(false)
  if (veil) return <>{children(veil)}</>
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="size-4" /> Unlock private keys</CardTitle>
        <CardDescription>
          {purpose} Your wallet signs a fixed message; the signature is turned into your VeilPay spend and view keys
          inside this browser and never leaves it. The first time, you sign twice to confirm your wallet signs deterministically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled={busy} onClick={() => { setBusy(true); unlock().catch(reportError).finally(() => setBusy(false)) }}>
          {busy ? 'Waiting for signature…' : 'Unlock with wallet'}
        </Button>
      </CardContent>
    </Card>
  )
}

/** Opens RainbowKit's connect modal, which also runs the SIWE sign-in step. */
export function SignInButton({ label = 'Connect wallet', size }: { label?: string; size?: 'default' | 'lg' }) {
  const { openConnectModal } = useConnectModal()
  return <Button size={size} disabled={!openConnectModal} onClick={() => openConnectModal?.()}>{label}</Button>
}

export function RequireLogin({ children }: { children: ReactNode }) {
  const { signedIn } = useSession()
  if (signedIn) return <>{children}</>
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your wallet</CardTitle>
        <CardDescription>Sign in with your wallet on Arc Testnet to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInButton />
      </CardContent>
    </Card>
  )
}
