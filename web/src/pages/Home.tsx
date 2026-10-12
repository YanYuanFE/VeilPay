import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageTitle } from '@/components/Layout'
import { LogoMark } from '@/components/Logo'
import { SignInButton } from '@/components/Unlock'
import { api } from '@/lib/api'
import { reportError } from '@/lib/format'
import { useSession } from '@/lib/session'

function CreateOrg() {
  const { unlock, refresh } = useSession()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      const w = await unlock() // the org treasury is owned by this wallet's VeilPay key
      const org = await api<{ id: string }>('/orgs', { method: 'POST', body: { name, ...w.address } })
      await refresh()
      navigate(`/orgs/${org.id}`)
    } catch (err) {
      reportError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog>
      <DialogTrigger render={<Button><Plus /> New organization</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>Your wallet becomes the owner. Its VeilPay key holds the private treasury.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="org-name">Name</Label>
          <Input id="org-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="Acme Labs" />
        </div>
        <DialogFooter>
          <Button disabled={busy || !name.trim()} onClick={submit}>{busy ? 'Creating…' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Home() {
  const { me, signedIn } = useSession()
  if (!me || !signedIn) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center animate-rise">
        <LogoMark className="mx-auto size-14" />
        <h1 className="mt-8 text-5xl leading-none">Enter the vault</h1>
        <p className="mx-auto mt-5 max-w-md leading-relaxed text-muted-foreground">
          Connect a wallet on Arc Testnet and sign in. Your private payroll keys are derived in this browser and never leave it.
        </p>
        <div className="mt-8 flex justify-center"><SignInButton size="lg" /></div>
      </div>
    )
  }
  return (
    <div>
      <PageTitle eyebrow="Workspace" action={<CreateOrg />}>Organizations</PageTitle>
      {me.orgs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline px-8 py-16 text-center">
          <p className="font-display text-2xl italic">No envelopes yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">Create an organization to hold a private treasury and invite your team.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {me.orgs.map((o, i) => (
            <Link key={o.id} to={`/orgs/${o.id}`} className="group animate-rise" style={{ animationDelay: `${i * 70}ms` }}>
              <article className="relative h-44 overflow-hidden rounded-lg border border-hairline bg-card/70 p-6 transition-all duration-500 group-hover:-translate-y-0.5 group-hover:border-bone/30">
                {/* envelope flap */}
                <svg className="pointer-events-none absolute inset-x-0 top-0 h-20 w-full text-hairline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0 0 L50 34 L100 0" fill="none" stroke="currentColor" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
                </svg>
                <LogoMark className="absolute left-1/2 top-[3.4rem] size-8 -translate-x-1/2 -translate-y-1/2 transition-transform duration-500 group-hover:rotate-[18deg]" />
                <div className="absolute inset-x-6 bottom-5 flex items-end justify-between gap-4">
                  <h2 className="truncate text-2xl">{o.name}</h2>
                  <span className="num shrink-0 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString('en-CA')}</span>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}
      {me.memberships.length > 0 && (
        <section className="mt-14">
          <p className="eyebrow">You are paid by</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {me.memberships.map((m) => <span key={m.id} className="rounded-full border border-hairline px-4 py-1.5 text-sm">{m.org_name}</span>)}
            <Button variant="outline" size="sm" render={<Link to="/me" />}>Open my pay</Button>
          </div>
        </section>
      )}
    </div>
  )
}
