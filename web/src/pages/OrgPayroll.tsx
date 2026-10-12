import { useCallback, useEffect, useState } from 'react'
import { Download, Printer, Save } from 'lucide-react'
import { toast } from 'sonner'
import { formatUnits } from 'viem'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { downloadCsv, printDocument } from '@/lib/export'
import { fmtUsdc, parseUsdc, reportError, short } from '@/lib/format'
import { openJson, sealJson, stageText, type Member, type OrgData, type Run, type RunRecord, type SalaryBook } from '@/lib/records'
import { useSession } from '@/lib/session'
import { PER_TX, chunkLines, runPayroll, unspentBalance, type PayLine, type Stage } from '@/lib/veilpay/actions'
import { EXPLORER, USDC_DECIMALS, VAULT } from '@/lib/veilpay/config'
import type { Wallet } from '@/lib/veilpay/crypto'

type OpenRun = Run & { record: RunRecord | null }
type Treasury = { total: bigint; largest: bigint; notes: number }

const usdc = (x: bigint) => formatUnits(x, USDC_DECIMALS)
const runTotal = (r: RunRecord) => r.lines.reduce((s, l) => s + BigInt(l.amount), 0n)
const lineTx = (r: RunRecord, i: number) => r.txs[Math.floor(i / PER_TX)] ?? ''

/** Payroll needs a single treasury note that covers the whole run (the circuit spends one note per transaction). */
function FundingCheck({ need, treasury }: { need: bigint; treasury: Treasury | null }) {
  if (!treasury || need === 0n || need <= treasury.largest) return null
  return (
    <Alert variant="destructive">
      <AlertTitle>Treasury note too small</AlertTitle>
      <AlertDescription>
        This run needs one note of at least {fmtUsdc(need)}. Your largest note is {fmtUsdc(treasury.largest)}
        {treasury.notes > 1 ? ` (${fmtUsdc(treasury.total)} across ${treasury.notes} notes, which can't be combined yet)` : ''}.
        Deposit at least {fmtUsdc(need)} as a single note in the Treasury tab.
      </AlertDescription>
    </Alert>
  )
}

export function Payroll({ data, w }: { data: OrgData; w: Wallet }) {
  const { client, account } = useSession()
  const orgId = data.org.id
  const ready = data.members.filter((m) => m.joined_at && m.owner_tag && m.view_pub)
  const [book] = useState<SalaryBook>(() => (data.org.salary_book ? openJson<SalaryBook>(w, data.org.salary_book) : {}))
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(book).map(([id, v]) => [id, usdc(BigInt(v))])))
  const [memo, setMemo] = useState(() => `${new Date().toISOString().slice(0, 7)} salary`)
  const [bulk, setBulk] = useState('')
  const [bonus, setBonus] = useState({ memberId: '', amount: '', memo: 'Bonus' })
  const [runs, setRuns] = useState<OpenRun[]>([])
  const [treasury, setTreasury] = useState<Treasury | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number; stage: string } | null>(null)

  const loadRuns = useCallback(async () => {
    const res = await api<{ runs: Run[] }>(`/orgs/${orgId}/runs`)
    setRuns(res.runs.map((r) => {
      try {
        return { ...r, record: openJson<RunRecord>(w, r.sealed) }
      } catch {
        return { ...r, record: null } // sealed to a different key
      }
    }))
  }, [orgId, w])
  const loadTreasury = useCallback(async () => {
    const { notes, total } = await unspentBalance(w)
    setTreasury({ total, notes: notes.length, largest: notes.reduce((m, n) => (n.amount > m ? n.amount : m), 0n) })
  }, [w])
  useEffect(() => { loadRuns().catch(reportError) }, [loadRuns])
  useEffect(() => { loadTreasury().catch(reportError) }, [loadTreasury])

  const toLine = (m: Member, amount: bigint, lineMemo: string): PayLine =>
    ({ memberId: m.id, name: m.name, address: { ownerTag: m.owner_tag!, viewPub: m.view_pub! }, amount, memo: lineMemo })

  const lines = (): PayLine[] => ready.filter((m) => amounts[m.id]?.trim()).map((m) => toLine(m, parseUsdc(amounts[m.id]), memo))

  let preview: { count: number; total: bigint; txs: number; error?: string } = { count: 0, total: 0n, txs: 0 }
  try {
    const ls = lines()
    preview = { count: ls.length, total: ls.reduce((s, l) => s + l.amount, 0n), txs: chunkLines(ls).length }
  } catch (err) {
    preview.error = (err as Error).message
  }
  let bonusAmount = 0n
  let bonusError: string | null = null
  try {
    if (bonus.amount.trim()) bonusAmount = parseUsdc(bonus.amount)
  } catch (err) {
    bonusError = (err as Error).message
  }

  const applyBulk = () => {
    const next = { ...amounts }
    const missing: string[] = []
    for (const line of bulk.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const [who, amt] = line.split(/[,\t]/).map((s) => s.trim())
      const m = ready.find((x) => x.email?.toLowerCase() === who?.toLowerCase() || x.name === who)
      if (!m || !amt) missing.push(who ?? line)
      else next[m.id] = amt
    }
    setAmounts(next)
    if (missing.length) toast.warning(`Not matched to a ready member: ${missing.join(', ')}`)
  }

  const saveDefaults = async () => {
    try {
      const next: SalaryBook = Object.fromEntries(ready.filter((m) => amounts[m.id]?.trim()).map((m) => [m.id, parseUsdc(amounts[m.id]).toString()]))
      await api(`/orgs/${orgId}/salary-book`, { method: 'PUT', body: { sealed: sealJson(w, next) } })
      toast.success(`Saved default amounts for ${Object.keys(next).length} member(s)`, { description: 'Encrypted to your key before upload.' })
    } catch (err) {
      reportError(err)
    }
  }

  const execute = async (runId: string, record: RunRecord, payLines: PayLine[]) => {
    const signer = { client: client!, account: account!, onStage: (s: Stage) => setProgress((p) => p && { ...p, stage: stageText[s] }) }
    setProgress({ done: 0, total: chunkLines(payLines).length, stage: 'Scanning treasury…' })
    try {
      await runPayroll(signer, w, runId, payLines, async (k, n, hash) => {
        record.txs[k] = hash
        setProgress({ done: k + 1, total: n, stage: k + 1 < n ? 'Next batch…' : 'Finishing…' })
        await api(`/orgs/${orgId}/runs/${runId}`, { method: 'PATCH', body: { status: 'running', sealed: sealJson(w, record) } })
      }, (first, n) => setProgress({ done: first, total: n, stage: first > 0 ? `Resuming after batch ${first}…` : 'Starting…' }))
      await api(`/orgs/${orgId}/runs/${runId}`, { method: 'PATCH', body: { status: 'done', sealed: sealJson(w, record) } })
      toast.success(record.kind === 'bonus' ? `Paid ${payLines[0].name}` : `Paid ${payLines.length} people`)
    } catch (err) {
      reportError(err)
      await api(`/orgs/${orgId}/runs/${runId}`, { method: 'PATCH', body: { status: 'failed', sealed: sealJson(w, record) } })
        .catch(reportError)
    } finally {
      setProgress(null)
      await Promise.all([loadRuns(), loadTreasury()]).catch(reportError)
    }
  }

  const start = async (payLines: PayLine[], kind: 'salary' | 'bonus') => {
    try {
      const record: RunRecord = {
        v: 1, kind, txs: [],
        lines: payLines.map((l) => ({ memberId: l.memberId, name: l.name, amount: l.amount.toString(), memo: l.memo })),
      }
      const run = await api<{ id: string }>(`/orgs/${orgId}/runs`, { method: 'POST', body: { recipients: payLines.length, sealed: sealJson(w, record) } })
      await execute(run.id, record, payLines)
    } catch (err) {
      reportError(err)
    }
  }

  const payBonus = () => {
    const m = ready.find((x) => x.id === bonus.memberId)
    if (!m) return toast.error('Pick a member')
    return start([toLine(m, bonusAmount, bonus.memo.trim() || 'Bonus')], 'bonus').then(() => setBonus({ ...bonus, amount: '' }))
  }

  const resume = async (run: OpenRun) => {
    const record = run.record!
    const payLines = record.lines.map((l) => {
      const m = data.members.find((x) => x.id === l.memberId)
      if (!m?.owner_tag || !m.view_pub) throw new Error(`member ${l.name} no longer has a payment key`)
      return toLine(m, BigInt(l.amount), l.memo)
    })
    await execute(run.id, record, payLines)
  }

  const runCsv = (r: OpenRun) => downloadCsv(
    `veilpay-${data.org.name}-${r.created_at.slice(0, 10)}-${r.id.slice(0, 8)}.csv`,
    [['member', 'amount_usdc', 'memo', 'transaction'], ...r.record!.lines.map((l, i) => [l.name, usdc(BigInt(l.amount)), l.memo, lineTx(r.record!, i)])],
    { org: data.org.name, run: r.id, kind: r.record!.kind ?? 'salary', status: r.status, vault: VAULT, generated: new Date().toISOString() },
  ).catch(reportError)

  const allCsv = () => {
    const rows = runs.flatMap((r) => (r.record
      ? r.record.lines.map((l, i) => [r.created_at, r.id, r.record!.kind ?? 'salary', r.status, l.name, usdc(BigInt(l.amount)), l.memo, lineTx(r.record!, i)])
      : []))
    return downloadCsv(`veilpay-${data.org.name}-payroll-history.csv`,
      [['created_at', 'run', 'kind', 'status', 'member', 'amount_usdc', 'memo', 'transaction'], ...rows],
      { org: data.org.name, runs: String(runs.length), vault: VAULT, generated: new Date().toISOString() }).catch(reportError)
  }

  const printReceipt = (r: OpenRun) => {
    try {
      const rec = r.record!
      printDocument({
        kind: rec.kind === 'bonus' ? 'One-off payment receipt' : 'Payroll receipt',
        title: data.org.name,
        amount: fmtUsdc(runTotal(rec)),
        fields: [
          ['Run', r.id], ['Date', new Date(r.created_at).toLocaleString()], ['Status', r.status], ['Recipients', String(rec.lines.length)],
          ...rec.lines.map((l): [string, string] => [l.name, `${fmtUsdc(BigInt(l.amount))} · ${l.memo}`]),
          ...rec.txs.filter(Boolean).map((h, i): [string, string] => [`Transaction ${i + 1}`, h]),
          ['Vault', `${VAULT} (Arc Testnet)`],
        ],
        footnote: 'Amounts are sealed on-chain; only each recipient and this employer can read them. This receipt was generated locally from the employer’s encrypted record.',
      })
    } catch (err) {
      reportError(err)
    }
  }

  const busy = progress !== null
  const memberOptions = ready.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>New payroll run</CardTitle>
          <CardDescription>
            Pays up to {PER_TX} people per transaction from one treasury note. Amounts and recipients are encrypted;
            each employee only learns their own payment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ready.length === 0 ? (
            <p className="text-sm text-muted-foreground">No member has registered a payment key yet. Share invite links from the Members tab.</p>
          ) : (
            <>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="memo">Memo (visible to each employee)</Label>
                  <Input id="memo" value={memo} maxLength={40} onChange={(e) => setMemo(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bulk">Bulk fill: <code>email or name, amount</code></Label>
                  <div className="flex gap-2">
                    <Textarea id="bulk" rows={1} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="alice@acme.dev, 2500" />
                    <Button variant="outline" onClick={applyBulk} disabled={!bulk.trim()}>Fill</Button>
                  </div>
                </div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Wallet</TableHead><TableHead className="w-48">Amount (USDC)</TableHead></TableRow></TableHeader>
                <TableBody>
                  {ready.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.name}</TableCell>
                      <TableCell className="num text-xs text-muted-foreground">{short(m.wallet_address!)}</TableCell>
                      <TableCell>
                        <Input value={amounts[m.id] ?? ''} inputMode="decimal" placeholder="0" className="num"
                          onChange={(e) => setAmounts({ ...amounts, [m.id]: e.target.value })} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-3">
                {preview.error ? (
                  <Alert variant="destructive"><AlertDescription>{preview.error}</AlertDescription></Alert>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {preview.count} recipient(s) · total <span className="num text-foreground">{fmtUsdc(preview.total)}</span> · {preview.txs} transaction(s)
                    {treasury && <> · treasury <span className="num">{fmtUsdc(treasury.total)}</span></>}
                  </p>
                )}
                <Button variant="ghost" size="sm" onClick={saveDefaults} disabled={Boolean(preview.error) || preview.count === 0}>
                  <Save /> Save as default amounts
                </Button>
              </div>
              <FundingCheck need={preview.total} treasury={treasury} />
              {progress ? (
                <div className="space-y-2">
                  <Progress value={(progress.done / progress.total) * 100} />
                  <p className="text-sm">Batch {Math.min(progress.done + 1, progress.total)} of {progress.total}: {progress.stage}</p>
                  <p className="text-xs text-muted-foreground">Keep this tab open. If it closes, use Resume below; no one is paid twice.</p>
                </div>
              ) : (
                <Button
                  disabled={preview.count === 0 || Boolean(preview.error) || (treasury !== null && preview.total > treasury.largest)}
                  onClick={() => start(lines(), 'salary')}
                >
                  Pay {preview.count} people privately
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {ready.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>One-off payment</CardTitle>
            <CardDescription>A bonus or reimbursement to one person, outside the regular run. Same privacy, one transaction.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_1.2fr_auto] md:items-end">
              <div className="space-y-1">
                <Label htmlFor="bonus-member">Member</Label>
                <select id="bonus-member" value={bonus.memberId} onChange={(e) => setBonus({ ...bonus, memberId: e.target.value })}
                  className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm dark:bg-input/30">
                  <option value="">Choose…</option>
                  {memberOptions}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bonus-amount">Amount (USDC)</Label>
                <Input id="bonus-amount" className="num" inputMode="decimal" value={bonus.amount} onChange={(e) => setBonus({ ...bonus, amount: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bonus-memo">Memo</Label>
                <Input id="bonus-memo" maxLength={40} value={bonus.memo} onChange={(e) => setBonus({ ...bonus, memo: e.target.value })} />
              </div>
              <Button disabled={busy || !bonus.memberId || bonusAmount <= 0n || Boolean(bonusError) || (treasury !== null && bonusAmount > treasury.largest)} onClick={payBonus}>
                Pay
              </Button>
            </div>
            {bonusError && <p className="text-sm text-destructive">{bonusError}</p>}
            <FundingCheck need={bonusAmount} treasury={treasury} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>History</CardTitle>
            <CardDescription>Run details are encrypted to your view key before they reach the server. Exports end with a SHA-256 line so edits are detectable.</CardDescription>
          </div>
          {runs.some((r) => r.record) && <Button variant="outline" size="sm" onClick={allCsv}><Download /> Export all</Button>}
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? <p className="text-sm text-muted-foreground">No payroll runs yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Kind</TableHead><TableHead>People</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Transactions</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="num text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{r.record?.kind === 'bonus' ? 'One-off' : 'Payroll'}</TableCell>
                    <TableCell>{r.recipients}</TableCell>
                    <TableCell className="num">{r.record ? fmtUsdc(runTotal(r.record)) : 'encrypted'}</TableCell>
                    <TableCell><Badge variant={r.status === 'done' ? 'default' : r.status === 'failed' ? 'destructive' : 'outline'}>{r.status}</Badge></TableCell>
                    <TableCell className="space-x-2">
                      {r.record?.txs.filter(Boolean).map((h) => (
                        <a key={h} className="num text-xs underline decoration-hairline underline-offset-4 hover:text-seal" href={`${EXPLORER}/tx/${h}`} target="_blank" rel="noreferrer">{short(h)}</a>
                      ))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {r.record && (
                        <>
                          <Button size="icon-sm" variant="ghost" aria-label="Download CSV" onClick={() => runCsv(r)}><Download /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label="Print receipt" onClick={() => printReceipt(r)}><Printer /></Button>
                        </>
                      )}
                      {r.status !== 'done' && r.record && !busy && (
                        <Button size="sm" variant="outline" className="ml-1" onClick={() => resume(r).catch(reportError)}>Resume</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
