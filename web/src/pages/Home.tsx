import { useEffect, useState } from 'react'
import { isAddress, type Address } from 'viem'
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
import { readToken, registerAsset } from '@/lib/veilpay/chain'
import { ASSETS, USDC, arc, assetOf } from '@/lib/veilpay/config'

const OTHER = 'other'
type Custom = { status: 'idle' | 'loading' } | { status: 'error'; error: string } | { status: 'ok'; symbol: string; decimals: number; registered: boolean }

/** Reads a pasted token address: symbol, decimals and whether the vault already knows it. */
function useCustomToken(address: string): Custom {
  const [state, setState] = useState<Custom>({ status: 'idle' })
  useEffect(() => {
    if (!isAddress(address)) return setState(address ? { status: 'error', error: 'Not an address' } : { status: 'idle' })
    let live = true
    setState({ status: 'loading' })
    readToken(address).then(
      (t) => live && setState(t.decimals < 6 || t.decimals > 30
        ? { status: 'error', error: `${t.symbol} has ${t.decimals} decimals; the vault supports 6 to 30` }
        : { status: 'ok', symbol: t.symbol, decimals: t.decimals, registered: t.registered }),
      (err) => {
        console.error('token lookup failed', address, err)
        if (live) setState({ status: 'error', error: 'Not an ERC-20 token on Arc' })
      },
    )
    return () => { live = false }
  }, [address])
  return state
}

function CreateOrg() {
  const { unlock, refresh, client, account } = useSession()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [choice, setChoice] = useState(USDC.address as string)
  const [customAddress, setCustomAddress] = useState('')
  const custom = useCustomToken(choice === OTHER ? customAddress.trim() : '')
  const [busy, setBusy] = useState<string | null>(null)
  const tokenReady = choice !== OTHER || custom.status === 'ok'
  const submit = async () => {
    setBusy('Creating…')
    try {
      const w = await unlock() // the org treasury is owned by this wallet's VeilPay key
      const asset = (choice === OTHER ? customAddress.trim() : choice) as Address
      if (choice === OTHER && custom.status === 'ok' && !custom.registered) {
        setBusy(`Registering ${custom.symbol}…`)
        await registerAsset(client!, account!, asset)
        setBusy('Creating…')
      }
      const org = await api<{ id: string }>('/orgs', { method: 'POST', body: { name, asset, ...w.address } })
      await refresh()
      navigate(`/orgs/${org.id}`)
    } catch (err) {
      reportError(err)
    } finally {
      setBusy(null)
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
        <div className="space-y-2">
          <Label htmlFor="org-asset">Payroll token</Label>
          <select id="org-asset" value={choice} onChange={(e) => setChoice(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm dark:bg-input/30">
            {ASSETS.map((a) => <option key={a.address} value={a.address}>{a.symbol}</option>)}
            <option value={OTHER}>Other token…</option>
          </select>
          {choice === OTHER && (
            <>
              <Input aria-label="Token address" value={customAddress} className="font-mono" placeholder="0x…" onChange={(e) => setCustomAddress(e.target.value)} />
              <p className={`text-xs ${custom.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {custom.status === 'loading' && 'Reading token…'}
                {custom.status === 'error' && custom.error}
                {custom.status === 'ok' && `${custom.symbol} · ${custom.decimals} decimals${custom.registered ? '' : ' · first use: you will sign one transaction to register it on the vault'}`}
                {custom.status === 'idle' && 'Any ERC-20 on Arc with 6 or more decimals. Fee-on-transfer and rebasing tokens are not supported.'}
              </p>
            </>
          )}
          <p className="text-xs text-muted-foreground">The treasury and every payment use this token. It can't be changed later.</p>
        </div>
        <DialogFooter>
          <Button disabled={!!busy || !name.trim() || !tokenReady} onClick={submit}>{busy ?? 'Create'}</Button>
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
          Connect a wallet on {arc.name} and sign in. Your private payroll keys are derived in this browser and never leave it.
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
          <p className="text-lg font-medium">No envelopes yet.</p>
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
                  <span className="num shrink-0 text-xs text-muted-foreground">{assetOf(o.asset).symbol} · {new Date(o.created_at).toLocaleDateString('en-CA')}</span>
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
