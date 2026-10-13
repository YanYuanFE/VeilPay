import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { Copy, RefreshCw, Trash2, Upload, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { PageTitle } from '@/components/Layout'
import { RequireKeys, RequireLogin } from '@/components/Unlock'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { csvString } from '@/lib/export'
import { fmtAmount, parseAmount, reportError, short } from '@/lib/format'
import { parseRoster } from '@/lib/roster'
import { useSession } from '@/lib/session'
import { deposit, unspentBalance } from '@/lib/veilpay/actions'
import { tokenBalance } from '@/lib/veilpay/chain'
import { USDC, assetOf, type Asset } from '@/lib/veilpay/config'
import type { Wallet } from '@/lib/veilpay/crypto'
import { stageText, type Member, type OrgData } from '@/lib/records'
import { Payroll } from '@/pages/OrgPayroll'

const inviteUrl = (code: string) => `${window.location.origin}/join/${code}`

// ---------- treasury ----------

function Treasury({ w, asset }: { w: Wallet; asset: Asset }) {
  const { client, account } = useSession()
  const [balance, setBalance] = useState<{ priv: bigint; notes: number; pub: bigint } | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ total, notes }, pub] = await Promise.all([unspentBalance(w, asset), tokenBalance(asset, account!)])
    setBalance({ priv: total, notes: notes.length, pub })
  }, [w, asset, account])
  useEffect(() => { load().catch(reportError) }, [load])

  const submit = async () => {
    try {
      const value = parseAmount(amount, asset)
      setBusy(asset.eip3009 ? 'Preparing…' : 'Checking Permit2 approval…')
      const hash = await deposit({ client: client!, account: account!, onStage: (s) => setBusy(stageText[s]) }, w, asset, value, 'treasury deposit')
      toast.success('Deposit confirmed', { description: hash })
      setAmount('')
      await load()
    } catch (err) {
      reportError(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Private treasury</CardTitle>
          <CardDescription>Spendable notes owned by your VeilPay key. Only you can compute this balance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="num text-5xl leading-none text-bone">{balance ? fmtAmount(balance.priv, asset) : '…'}</p>
          <p className="eyebrow pt-2">{balance ? `${balance.notes} sealed note(s)` : ''}</p>
          <Button variant="ghost" size="sm" onClick={() => load().catch(reportError)}><RefreshCw /> Refresh</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Deposit</CardTitle>
          <CardDescription>
            Moves public {asset.symbol} from your wallet ({balance ? fmtAmount(balance.pub, asset) : '…'}) into one private note,
            authorized by a single signature{asset.eip3009 ? ' (EIP-3009, no approval needed)' : ' (Permit2, after a one-time approval)'}.
            The deposit amount is public; how you split it later is not.
            {asset === USDC
              ? ' The VeilPay relayer submits it and takes a small fee from the deposit.'
              : ` It is sent from your wallet, which pays gas in USDC.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Amount in ${asset.symbol}`} inputMode="decimal" />
          <Button disabled={busy !== null || !amount} onClick={submit}>Deposit</Button>
        </CardContent>
        {busy && <CardContent className="text-sm text-muted-foreground">{busy}</CardContent>}
      </Card>
    </div>
  )
}

// ---------- members ----------

/** Paste or upload a roster; nothing is sent until every line parses. */
function AddMembersDialog({ orgId, onAdded }: { orgId: string; onAdded: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { rows, errors } = useMemo(() => parseRoster(text), [text])

  const loadFile = (f: File | undefined) => {
    if (!f) return
    f.text().then((t) => { setText(t); setFileName(f.name) }, reportError)
  }
  const reset = () => { setText(''); setFileName(null) }

  const add = async () => {
    setBusy(true)
    try {
      const members = rows.map(({ name, email }) => ({ name, email }))
      const res = await api<{ members: Member[] }>(`/orgs/${orgId}/members`, { method: 'POST', body: { members } })
      toast.success(`Added ${res.members.length} member(s)`)
      reset()
      setOpen(false)
      await onAdded()
    } catch (err) {
      reportError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o && !busy) reset() }}>
      <DialogTrigger render={<Button size="sm"><UserPlus /> Add members</Button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add members</DialogTitle>
          <DialogDescription>
            One person per line as <code>name, email</code> (email optional), or upload a CSV with those columns. A header
            row is fine, and rows copied from a spreadsheet can be pasted directly. Each person gets a private invite link.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" render={<label />}>
              <Upload /> Upload CSV
              <input type="file" accept=".csv,text/csv,text/plain" className="sr-only"
                onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = '' }} />
            </Button>
            {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
          </div>
          <Textarea rows={6} value={text} aria-label="Roster" className="font-mono text-xs"
            onChange={(e) => { setText(e.target.value); setFileName(null) }}
            placeholder={'name,email\nAlice Chen,alice@acme.dev\n"Li, Bob",bob@acme.dev\nCarol Wu'} />
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>Fix {errors.length} problem{errors.length === 1 ? '' : 's'} before adding</AlertTitle>
              <AlertDescription>
                <ul className="space-y-0.5">
                  {errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}
                  {errors.length > 5 && <li>…and {errors.length - 5} more</li>}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {rows.length > 0 && (
            <div className="max-h-56 overflow-auto rounded-md border border-hairline">
              <Table>
                <TableHeader><TableRow><TableHead className="w-14">Line</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.line}>
                      <TableCell className="num text-xs text-muted-foreground">{r.line}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.email ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button disabled={busy || rows.length === 0 || errors.length > 0} onClick={add}>
            {busy ? 'Adding…' : rows.length ? `Add ${rows.length} member${rows.length === 1 ? '' : 's'}` : 'Add members'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Members({ data, reload }: { data: OrgData; reload: () => Promise<void> }) {
  const remove = async (m: Member) => {
    try {
      await api(`/orgs/${data.org.id}/members/${m.id}`, { method: 'DELETE' })
      await reload()
    } catch (err) {
      reportError(err)
    }
  }
  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`), reportError)
  const pending = data.members.filter((m) => !m.joined_at)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Members ({data.members.length})</CardTitle>
            <CardDescription>People must open their invite link and register a payment key before they can be paid.</CardDescription>
          </div>
          <AddMembersDialog orgId={data.org.id} onAdded={reload} />
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => copy(csvString(pending.map((m) => [m.name, m.email ?? '', inviteUrl(m.invite_code)])), 'Invite links')}>
              <Copy /> Copy {pending.length} pending invite link(s) as CSV
            </Button>
          )}
          <Table>
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {data.members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.email ?? '—'}</TableCell>
                  <TableCell>
                    {m.joined_at ? <Badge>Ready · {short(m.wallet_address!)}</Badge> : <Badge variant="outline">Invited</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {!m.joined_at && (
                      <Button variant="ghost" size="sm" onClick={() => copy(inviteUrl(m.invite_code), 'Invite link')}><Copy /> Link</Button>
                    )}
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.name}`} onClick={() => remove(m)}><Trash2 /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- page ----------

function OrgContent({ w }: { w: Wallet }) {
  const { id } = useParams()
  const [data, setData] = useState<OrgData | null>(null)
  const reload = useCallback(async () => setData(await api<OrgData>(`/orgs/${id}`)), [id])
  useEffect(() => { reload().catch(reportError) }, [reload])
  if (!data) return <p className="text-muted-foreground">Loading organization…</p>
  if (data.org.owner_tag !== w.ownerTag.toString()) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Key mismatch</AlertTitle>
        <AlertDescription>The VeilPay key from this wallet does not own this organization's treasury.</AlertDescription>
      </Alert>
    )
  }
  return (
    <div>
      <PageTitle eyebrow={`Organization · pays in ${assetOf(data.org.asset).symbol}`}>{data.org.name}</PageTitle>
      <Tabs defaultValue="treasury">
        <TabsList>
          <TabsTrigger value="treasury">Treasury</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>
        <TabsContent value="treasury"><Treasury w={w} asset={assetOf(data.org.asset)} /></TabsContent>
        <TabsContent value="members"><Members data={data} reload={reload} /></TabsContent>
        <TabsContent value="payroll"><Payroll data={data} w={w} /></TabsContent>
      </Tabs>
    </div>
  )
}

export function OrgPage() {
  return (
    <RequireLogin>
      <RequireKeys purpose="The treasury and payroll records are encrypted to your key.">{(w) => <OrgContent w={w} />}</RequireKeys>
    </RequireLogin>
  )
}
