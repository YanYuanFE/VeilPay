import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, CheckCircle2, CircleAlert, XCircle } from 'lucide-react'
import { PageTitle } from '@/components/Layout'
import { LogoMark } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { fmtAmount, short } from '@/lib/format'
import { loadAssets } from '@/lib/veilpay/chain'
import { assetOf } from '@/lib/veilpay/config'
import { EXPLORER, VAULT, arc } from '@/lib/veilpay/config'
import { parseDisclosure, verifyDisclosure, type Disclosure, type Verification } from '@/lib/veilpay/disclosure'

type State =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'invalid'; error: string }
  | { status: 'done'; d: Disclosure; v: Verification }

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-bone" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-seal" />}
      <span className={ok ? '' : 'text-seal'}>{children}</span>
    </li>
  )
}

function Result({ d, v }: { d: Disclosure; v: Verification }) {
  const verified = v.sameVault && v.openingMatches && v.onChain
  return (
    <Card className="animate-rise">
      <CardContent className="space-y-8 py-2">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="eyebrow">{verified ? 'Verified payment' : 'Not verified'}</p>
            <p className={`num mt-3 text-5xl leading-none md:text-6xl ${verified ? 'text-bone' : 'text-bone/40 line-through decoration-seal'}`}>
              {fmtAmount(BigInt(d.amount), assetOf(d.asset))}
            </p>
            <p className="mt-3 text-muted-foreground">
              {d.memo || 'No memo'}{v.timestamp && <> · paid {v.timestamp.toLocaleString()}</>}
            </p>
          </div>
          <LogoMark className={`size-14 shrink-0 ${verified ? '' : 'opacity-30 grayscale'}`} />
        </div>

        <ul className="space-y-3 text-sm">
          <Check ok={v.sameVault}>Link is for the VeilPay vault on {arc.name} ({short(VAULT, 8, 6)})</Check>
          <Check ok={v.openingMatches}>The token, amount and memo hash to the stated commitment</Check>
          <Check ok={v.onChain}>That commitment was recorded by the vault in block <span className="num">{Number(d.block).toLocaleString('en-US')}</span> as note #{d.index}</Check>
        </ul>

        <dl className="num grid gap-x-8 gap-y-2 border-t border-hairline pt-5 text-xs text-muted-foreground md:grid-cols-[auto_1fr]">
          <dt>commitment</dt><dd className="break-all text-bone/80">0x{BigInt(d.commitment).toString(16).padStart(64, '0')}</dd>
          <dt>vault</dt>
          <dd><a className="inline-flex items-center gap-1 text-bone/80 hover:text-seal" href={`${EXPLORER}/address/${VAULT}`} target="_blank" rel="noreferrer">{VAULT} <ArrowUpRight className="size-3" /></a></dd>
        </dl>

        <div className="rounded-md border border-hairline bg-ink/60 p-4 text-sm leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-2 text-bone"><CircleAlert className="size-4" /> What this does not prove</p>
          <ul className="mt-2 space-y-1">
            <li>· Who paid it. Confirm the employer separately, for example from the payslip or an employment letter.</li>
            <li>· That the presenter is the recipient: the payer also knows these details.</li>
            <li>· That it hasn't been withdrawn since; only the recipient's key can show that.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

export function VerifyPage() {
  const [input, setInput] = useState('')
  const [state, setState] = useState<State>({ status: 'idle' })

  const run = useCallback(async (raw: string) => {
    let d: Disclosure
    try {
      d = parseDisclosure(raw)
    } catch (err) {
      setState({ status: 'invalid', error: (err as Error).message })
      return
    }
    setState({ status: 'checking' })
    try {
      await loadAssets([d.asset])
      setState({ status: 'done', d, v: await verifyDisclosure(d) })
    } catch (err) {
      setState({ status: 'invalid', error: `could not reach Arc to verify: ${(err as Error).message}` })
    }
  }, [])

  // links arrive as /verify#d=...; the fragment never reaches any server
  useEffect(() => {
    if (window.location.hash.startsWith('#d=')) void run(window.location.hash)
  }, [run])

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle eyebrow="For landlords, banks and auditors">Verify a payment</PageTitle>
      {state.status === 'done' ? (
        <div className="space-y-4">
          <Result d={state.d} v={state.v} />
          <Button variant="ghost" onClick={() => { history.replaceState(null, '', '/verify'); setState({ status: 'idle' }) }}>Check another</Button>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Paste a verification link</CardTitle>
            <CardDescription>
              An employee creates this link for one payment. Your browser checks it directly against the vault on Arc;
              VeilPay's servers are not involved and nothing is published.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={4} className="num text-xs" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`${window.location.origin}/verify#d=…`} />
            {state.status === 'invalid' && <p className="text-sm text-seal">{state.error}</p>}
            <Button disabled={!input.trim() || state.status === 'checking'} onClick={() => run(input)}>
              {state.status === 'checking' ? 'Checking on Arc…' : 'Verify'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
