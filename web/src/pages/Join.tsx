import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CheckCircle2 } from 'lucide-react'
import { LogoMark } from '@/components/Logo'
import { RequireKeys, RequireLogin } from '@/components/Unlock'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { reportError } from '@/lib/format'
import { useSession } from '@/lib/session'
import type { Wallet } from '@/lib/veilpay/crypto'

type Invite = { orgName: string; memberName: string; joined: boolean; wallet: string | null }

function Accept({ code, invite, w }: { code: string; invite: Invite; w: Wallet }) {
  const { refresh } = useSession()
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const accept = async () => {
    setBusy(true)
    try {
      await api(`/invites/${code}/accept`, { method: 'POST', body: w.address })
      await refresh()
      setDone(true)
    } catch (err) {
      reportError(err)
    } finally {
      setBusy(false)
    }
  }
  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5" /> You're set up</CardTitle>
          <CardDescription>{invite.orgName} can now pay you privately. Payments appear under My pay.</CardDescription>
        </CardHeader>
        <CardContent><Button render={<Link to="/me" />}>Go to My pay</Button></CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Register your payment key</CardTitle>
        <CardDescription>
          This shares only your public payment address (an owner tag and an encryption key) with {invite.orgName}.
          Your spend key stays in this browser.
        </CardDescription>
      </CardHeader>
      <CardContent><Button disabled={busy} onClick={accept}>{busy ? 'Registering…' : 'Accept invite'}</Button></CardContent>
    </Card>
  )
}

export function JoinPage() {
  const { code } = useParams()
  const [invite, setInvite] = useState<Invite | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<Invite>(`/invites/${code}`).then(setInvite, (err: Error) => setError(err.message))
  }, [code])
  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  if (!invite) return <p className="text-muted-foreground">Loading invite…</p>
  return (
    <div className="mx-auto max-w-xl space-y-10 py-6">
      <div className="animate-rise text-center">
        <LogoMark className="mx-auto size-12" />
        <p className="eyebrow mt-8">A sealed invitation</p>
        <h1 className="mt-4 text-4xl leading-tight md:text-5xl">{invite.orgName} <em className="text-muted-foreground">invites</em> {invite.memberName}</h1>
        <p className="mx-auto mt-4 max-w-md text-muted-foreground">Accept to receive salary in USDC that only you can see and withdraw.</p>
      </div>
      <RequireLogin>
        <RequireKeys purpose="Your payment key is derived from your wallet so you can recover it on any device.">
          {(w) => <Accept code={code!} invite={invite} w={w} />}
        </RequireKeys>
      </RequireLogin>
    </div>
  )
}
