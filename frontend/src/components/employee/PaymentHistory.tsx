import { useEffect, useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { Lock, ExternalLink } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PAYROLL_TOKEN_ADDRESS } from '@/lib/contracts'
import { formatTimestamp, shortenAddress } from '@/lib/utils'
import { parseAbiItem } from 'viem'

interface PaymentEvent {
  from: string
  to: string
  blockNumber: bigint
  transactionHash: string
  timestamp: number
}

export function PaymentHistory() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [payments, setPayments] = useState<PaymentEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!address || !publicClient) return

    let cancelled = false
    setIsLoading(true)

    async function fetchEvents() {
      try {
        // Public RPC limits range to 50k blocks; query only the last 50k
        const latest = await publicClient!.getBlockNumber()
        const fromBlock = latest > 50000n ? latest - 50000n : 0n

        const logs = await publicClient!.getLogs({
          address: PAYROLL_TOKEN_ADDRESS as `0x${string}`,
          event: parseAbiItem('event ConfidentialTransfer(address indexed from, address indexed to)'),
          args: { to: address as `0x${string}` },
          fromBlock,
          toBlock: 'latest',
        })

        if (cancelled) return

        const events: PaymentEvent[] = await Promise.all(
          logs.map(async (log) => {
            let timestamp = 0
            try {
              const block = await publicClient!.getBlock({ blockNumber: log.blockNumber })
              timestamp = Number(block.timestamp)
            } catch {
              // ignore
            }
            return {
              from: (log.args as any).from || '',
              to: (log.args as any).to || '',
              blockNumber: log.blockNumber,
              transactionHash: log.transactionHash,
              timestamp,
            }
          })
        )

        if (!cancelled) {
          setPayments(events.reverse())
        }
      } catch (err) {
        console.error('Failed to fetch payment events:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchEvents()
    return () => { cancelled = true }
  }, [address, publicClient])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Payment history</h3>
        <p className="mt-1 text-sm text-muted-foreground">Confidential payment records</p>
      </div>
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>From</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Transaction</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <p className="text-sm text-muted-foreground">Loading payment history...</p>
                </TableCell>
              </TableRow>
            ) : payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <Lock className="size-4 text-primary" />
                    <p className="text-sm text-muted-foreground">No payments yet</p>
                    <p className="text-xs text-muted-foreground/60">
                      Payments will appear here after your employer runs payroll
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              payments.map((p) => (
                <TableRow key={p.transactionHash}>
                  <TableCell className="tabular-nums text-sm">
                    {formatTimestamp(p.timestamp)}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {shortenAddress(p.from)}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="size-3" /> Encrypted
                    </span>
                  </TableCell>
                  <TableCell>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${p.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {p.transactionHash.slice(0, 10)}...
                      <ExternalLink className="size-3" />
                    </a>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
