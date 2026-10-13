import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Download, Printer, RefreshCw, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { isAddress, type Address } from 'viem'
import { PageTitle } from '@/components/Layout'
import { RequireKeys, RequireLogin } from '@/components/Unlock'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { downloadCsv, printDocument } from '@/lib/export'
import { fmtAmount, parseAmount, reportError, short } from '@/lib/format'
import { useSession } from '@/lib/session'
import { myNotes, withdraw, type Stage } from '@/lib/veilpay/actions'
import { formatUnits } from 'viem'
import { relayQuote } from '@/lib/veilpay/chain'
import { stageText } from '@/lib/records'
import { ASSETS, EXPLORER, USDC, VAULT, assetOf } from '@/lib/veilpay/config'
import { disclosureFor, disclosureUrl } from '@/lib/veilpay/disclosure'
import type { Note, Wallet } from '@/lib/veilpay/crypto'

type Row = Note & { spent: boolean }

function WithdrawDialog({ note, w, onClose }: { note: Row; w: Wallet; onClose: (changed: boolean) => void }) {
  const { client, account } = useSession()
  const asset = assetOf(note.asset)
  const relayed = asset === USDC // the relayer only takes USDC fees
  const [quote, setQuote] = useState<{ address: Address; fee: bigint } | null>(null)
  const [amount, setAmount] = useState(() => (relayed ? '' : formatUnits(note.amount, asset.decimals)))
  const [recipient, setRecipient] = useState<string>(account ?? '')
  const [stage, setStage] = useState<string | null>(null)

  useEffect(() => {
    if (!relayed) return
    relayQuote().then((q) => {
      setQuote(q)
      if (note.amount > q.fee) setAmount(formatUnits(note.amount - q.fee, asset.decimals))
    }, reportError)
  }, [relayed, note.amount, asset.decimals])

  const fee = quote?.fee ?? 0n
  const max = note.amount > fee ? note.amount - fee : 0n

  const submit = async () => {
    try {
      if (relayed && !quote) throw new Error('relayer quote not loaded')
      if (!isAddress(recipient)) throw new Error('recipient must be a valid address')
      const value = parseAmount(amount, asset)
      const route = relayed ? { relayer: quote! } : { signer: { client: client!, account: account! } }
      const hash = await withdraw(w, note, value, recipient as Address, route, (s: Stage) => setStage(stageText[s]))
      toast.success('Withdrawal confirmed', { description: hash })
      onClose(true)
    } catch (err) {
      reportError(err)
    } finally {
      setStage(null)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw to a wallet</DialogTitle>
          <DialogDescription>
            The withdrawn amount, token and recipient become public. Whatever you leave stays private as a new note.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="wd-amount">Amount (max {relayed && !quote ? '…' : fmtAmount(max, asset)})</Label>
            <Input id="wd-amount" value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wd-to">Recipient</Label>
            <Input id="wd-to" value={recipient} className="font-mono" onChange={(e) => setRecipient(e.target.value.trim())} />
          </div>
          <p className="text-xs text-muted-foreground">
            {relayed ? (
              <>
                The VeilPay relayer submits the transaction and pays gas, so you need no gas and no sending wallet appears on-chain.
                Its fee{quote ? <> of <span className="num">{fmtAmount(quote.fee, asset)}</span></> : ''} comes out of this payment.{' '}
              </>
            ) : (
              <>The relayer only handles USDC, so this {asset.symbol} withdrawal is sent from your connected wallet, which pays gas in USDC and becomes the public sender. </>
            )}
            Withdrawing to the wallet that registered your key links that wallet to this payment; use a fresh address for more privacy.
          </p>
        </div>
        <DialogFooter>
          <Button disabled={stage !== null || (relayed && !quote)} onClick={submit}>{stage ?? 'Withdraw'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Builds a private verification link for one note; nothing is published or sent to VeilPay. */
function ShareDialog({ note, w, onClose }: { note: Row; w: Wallet; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const url = disclosureUrl(disclosureFor(w, note))
  const copy = () => navigator.clipboard.writeText(url).then(() => { setCopied(true); toast.success('Verification link copied') }, reportError)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share proof of this payment</DialogTitle>
          <DialogDescription>
            For a landlord, bank or auditor. They open the link and their browser checks it against the vault on Arc;
            the payment details stay in the link and are never posted on-chain or sent to VeilPay.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-hairline bg-ink/60 p-3">
            <p className="eyebrow">Reveals to whoever holds the link</p>
            <p className="mt-2"><span className="num">{fmtAmount(note.amount, assetOf(note.asset))}</span> · {note.memo || 'no memo'} · block <span className="num">{note.blockNumber.toString()}</span></p>
          </div>
          <ul className="space-y-1.5 text-muted-foreground">
            <li>· It does not reveal your other payments, your balance or your keys, and cannot be used to spend.</li>
            <li>· It proves the payment exists in the vault. It does not prove who paid it or that it is still unspent.</li>
            <li>· Anyone you forward it to can read the amount. Share it like a document.</li>
          </ul>
          <Input readOnly value={url} className="num text-xs" onFocus={(e) => e.currentTarget.select()} />
        </div>
        <DialogFooter>
          <Button onClick={copy}>{copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy link'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MyPayContent({ w }: { w: Wallet }) {
  const { me } = useSession()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [selected, setSelected] = useState<Row | null>(null)
  const [sharing, setSharing] = useState<Row | null>(null)
  const load = useCallback(async () => {
    setRows((await myNotes(w)).filter((n) => n.amount > 0n).sort((a, b) => b.index - a.index))
  }, [w])
  useEffect(() => { load().catch(reportError) }, [load])

  const mismatch = me?.memberships.filter((m) => m.owner_tag && m.owner_tag !== w.ownerTag.toString()) ?? []
  const unspent = rows?.filter((r) => !r.spent) ?? []
  const totals = ASSETS.map((a) => ({ asset: a, total: unspent.filter((r) => assetOf(r.asset) === a).reduce((s, r) => s + r.amount, 0n) }))

  const exportCsv = () => downloadCsv(`veilpay-payments-${new Date().toISOString().slice(0, 10)}.csv`,
    [['memo', 'amount', 'asset', 'block', 'note_index', 'status', 'commitment'],
      ...(rows ?? []).map((r) => [r.memo, formatUnits(r.amount, assetOf(r.asset).decimals), assetOf(r.asset).symbol, r.blockNumber.toString(), String(r.index), r.spent ? 'spent' : 'available', `0x${r.commitment.toString(16).padStart(64, '0')}`])],
    { vault: VAULT, generated: new Date().toISOString() }).catch(reportError)

  const printPayslip = (r: Row) => {
    try {
      printDocument({
        kind: 'Payslip',
        title: r.memo || 'Payment',
        amount: fmtAmount(r.amount, assetOf(r.asset)),
        fields: [
          ['Status', r.spent ? 'Withdrawn or moved' : 'Available in vault'],
          ['Block', r.blockNumber.toString()],
          ['Note index', String(r.index)],
          ['Commitment', `0x${r.commitment.toString(16).padStart(64, '0')}`],
          ['Vault', `${VAULT} (Arc Testnet)`],
          ['Explorer', `${EXPLORER}/address/${VAULT}`],
        ],
        footnote: 'Decrypted locally with your VeilPay key. To let a third party verify this payment, use “Share proof” in VeilPay instead of this printout.',
      })
    } catch (err) {
      reportError(err)
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Employee">My pay</PageTitle>
      {mismatch.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Key mismatch</AlertTitle>
          <AlertDescription>
            Your registered key for {mismatch.map((m) => m.org_name).join(', ')} differs from the key derived now. Payments to the old key won't show here.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Private balance</CardTitle>
          <CardDescription>Decrypted in your browser from public chain data. Nobody else can compute it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {rows ? totals.map((t) => (
            <p key={t.asset.symbol} className="num text-4xl leading-none text-bone">{fmtAmount(t.total, t.asset)}</p>
          )) : <p className="num text-5xl leading-none text-bone">…</p>}
          <Button variant="ghost" size="sm" onClick={() => load().catch(reportError)}><RefreshCw /> Refresh</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Payments</CardTitle>
            <CardDescription>Each payment is a separate note. Withdraw one at a time, or share a private proof of one.</CardDescription>
          </div>
          {rows && rows.length > 0 && <Button variant="outline" size="sm" onClick={exportCsv}><Download /> Export</Button>}
        </CardHeader>
        <CardContent>
          {rows && rows.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Memo</TableHead><TableHead>Amount</TableHead><TableHead>Block</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {rows?.map((r) => (
                  <TableRow key={r.index}>
                    <TableCell>{r.memo || '—'}</TableCell>
                    <TableCell className="num">{fmtAmount(r.amount, assetOf(r.asset))}</TableCell>
                    <TableCell className="num text-muted-foreground" title={`note #${r.index}`}>{r.blockNumber.toString()} <span className="text-xs">· {short(`0x${r.commitment.toString(16)}`, 6, 4)}</span></TableCell>
                    <TableCell>{r.spent ? <Badge variant="outline">Spent</Badge> : <Badge>Available</Badge>}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button size="icon-sm" variant="ghost" aria-label="Print payslip" onClick={() => printPayslip(r)}><Printer /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setSharing(r)}><Share2 /> Share proof</Button>
                      {!r.spent && <Button size="sm" variant="outline" className="ml-1" onClick={() => setSelected(r)}>Withdraw</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {sharing && <ShareDialog key={sharing.index} note={sharing} w={w} onClose={() => setSharing(null)} />}
      {selected && (
        <WithdrawDialog key={selected.index} note={selected} w={w}
          onClose={(changed) => { setSelected(null); if (changed) load().catch(reportError) }} />
      )}
    </div>
  )
}

export function MyPayPage() {
  return (
    <RequireLogin>
      <RequireKeys purpose="Your payments are encrypted to this key.">{(w) => <MyPayContent w={w} />}</RequireKeys>
    </RequireLogin>
  )
}
