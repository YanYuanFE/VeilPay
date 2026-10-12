import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { Copy, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageTitle } from '@/components/Layout'
import { RequireKeys, RequireLogin } from '@/components/Unlock'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { fmtUsdc, parseUsdc, reportError, short } from '@/lib/format'
import { useSession } from '@/lib/session'
import { deposit, unspentBalance } from '@/lib/veilpay/actions'
import { usdcBalance } from '@/lib/veilpay/chain'
import type { Wallet } from '@/lib/veilpay/crypto'
import { stageText, type Member, type OrgData } from '@/lib/records'
import { Payroll } from '@/pages/OrgPayroll'

const inviteUrl = (code: string) => `${window.location.origin}/join/${code}`

// ---------- treasury ----------

function Treasury({ w }: { w: Wallet }) {
  const { client, account } = useSession()
  const [balance, setBalance] = useState<{ priv: bigint; notes: number; pub: bigint } | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ total, notes }, pub] = await Promise.all([unspentBalance(w), usdcBalance(account!)])
    setBalance({ priv: total, notes: notes.length, pub })
  }, [w, account])
  useEffect(() => { load().catch(reportError) }, [load])

  const submit = async () => {
    try {
      const value = parseUsdc(amount)
      setBusy('Approving USDC…')
      const hash = await deposit({ client: client!, account: account!, onStage: (s) => setBusy(stageText[s]) }, w, value, 'treasury deposit')
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
          <p className="num text-5xl leading-none text-bone">{balance ? fmtUsdc(balance.priv) : '…'}</p>
          <p className="eyebrow pt-2">{balance ? `${balance.notes} sealed note(s)` : ''}</p>
          <Button variant="ghost" size="sm" onClick={() => load().catch(reportError)}><RefreshCw /> Refresh</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Deposit</CardTitle>
          <CardDescription>
            Moves public USDC from your wallet ({balance ? fmtUsdc(balance.pub) : '…'}) into one private note.
            The deposit amount is public; how you split it later is not.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount in USDC" inputMode="decimal" />
          <Button disabled={busy !== null || !amount} onClick={submit}>Deposit</Button>
        </CardContent>
        {busy && <CardContent className="text-sm text-muted-foreground">{busy}</CardContent>}
      </Card>
    </div>
  )
}

// ---------- members ----------

function parseRoster(text: string) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [name, email] = line.split(/[,\t]/).map((s) => s.trim())
    return { name, email: email || undefined }
  })
}

function Members({ data, reload }: { data: OrgData; reload: () => Promise<void> }) {
  const [roster, setRoster] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => parseRoster(roster), [roster])

  const add = async () => {
    setBusy(true)
    try {
      const res = await api<{ members: Member[] }>(`/orgs/${data.org.id}/members`, { method: 'POST', body: { members: parsed } })
      toast.success(`Added ${res.members.length} member(s)`)
      setRoster('')
      await reload()
    } catch (err) {
      reportError(err)
    } finally {
      setBusy(false)
    }
  }
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
        <CardHeader>
          <CardTitle>Add people in bulk</CardTitle>
          <CardDescription>One person per line: <code>name, email</code> (email optional). Each gets a private invite link.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={5} value={roster} onChange={(e) => setRoster(e.target.value)} placeholder={'Alice Chen, alice@acme.dev\nBob Li, bob@acme.dev\nCarol Wu'} />
          <Button disabled={busy || parsed.length === 0} onClick={add}>{busy ? 'Adding…' : parsed.length ? `Add ${parsed.length} member${parsed.length === 1 ? '' : 's'}` : 'Add members'}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Members ({data.members.length})</CardTitle>
          <CardDescription>People must open their invite link and register a payment key before they can be paid.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => copy(pending.map((m) => `${m.name},${m.email ?? ''},${inviteUrl(m.invite_code)}`).join('\n'), 'Invite links')}>
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
      <PageTitle eyebrow="Organization">{data.org.name}</PageTitle>
      <Tabs defaultValue="treasury">
        <TabsList>
          <TabsTrigger value="treasury">Treasury</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>
        <TabsContent value="treasury"><Treasury w={w} /></TabsContent>
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
