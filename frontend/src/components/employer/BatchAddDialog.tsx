import { useState } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { encodeFunctionData } from 'viem'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ConfidentialPayrollABI, PAYROLL_MANAGER_ADDRESS } from '@/lib/contracts'
import { encryptAmount } from '@/lib/fhe'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface EmployeeRow {
  address: string
  salary: string
}

type Status = 'idle' | 'encrypting' | 'pending' | 'done' | 'error'

interface RowStatus {
  status: Status
  error?: string
}

export function BatchAddDialog({ open, onOpenChange }: Props) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()

  const [rows, setRows] = useState<EmployeeRow[]>([
    { address: '', salary: '' },
    { address: '', salary: '' },
  ])
  const [processing, setProcessing] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [rowStatuses, setRowStatuses] = useState<RowStatus[]>([])

  const addRow = () => setRows([...rows, { address: '', salary: '' }])

  const removeRow = (i: number) => {
    if (rows.length <= 1) return
    setRows(rows.filter((_, idx) => idx !== i))
  }

  const updateRow = (i: number, field: keyof EmployeeRow, value: string) => {
    const updated = [...rows]
    updated[i] = { ...updated[i], [field]: value }
    setRows(updated)
  }

  const validate = (): string | null => {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r.address || !r.salary) return `Row ${i + 1}: all fields required`
      if (!/^0x[0-9a-fA-F]{40}$/.test(r.address)) return `Row ${i + 1}: invalid address`
      const num = parseFloat(r.salary)
      if (isNaN(num) || num <= 0) return `Row ${i + 1}: salary must be positive`
    }
    return null
  }

  const handleSubmit = async () => {
    if (!address || !walletClient || !publicClient) return
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }

    setProcessing(true)
    const statuses: RowStatus[] = rows.map(() => ({ status: 'idle' as Status }))
    setRowStatuses([...statuses])

    let successCount = 0

    for (let i = 0; i < rows.length; i++) {
      setCurrentIndex(i)
      const row = rows[i]
      statuses[i] = { status: 'encrypting' }
      setRowStatuses([...statuses])

      try {
        const salaryInUnits = BigInt(Math.round(parseFloat(row.salary) * 1e6))
        const encrypted = await encryptAmount(PAYROLL_MANAGER_ADDRESS, address, salaryInUnits)

        statuses[i] = { status: 'pending' }
        setRowStatuses([...statuses])

        const data = encodeFunctionData({
          abi: ConfidentialPayrollABI,
          functionName: 'addEmployee',
          args: [row.address as `0x${string}`, encrypted.handles[0] as `0x${string}`, encrypted.inputProof as `0x${string}`],
        })

        const hash = await walletClient.sendTransaction({
          to: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
          data,
          gas: BigInt(15_000_000),
        })

        await publicClient.waitForTransactionReceipt({ hash })
        statuses[i] = { status: 'done' }
        successCount++
      } catch (error) {
        statuses[i] = { status: 'error', error: error instanceof Error ? error.message : 'Failed' }
      }
      setRowStatuses([...statuses])
    }

    setCurrentIndex(-1)
    setProcessing(false)
    queryClient.invalidateQueries()

    if (successCount === rows.length) {
      toast.success(`${successCount} employees added successfully.`)
      onOpenChange(false)
    } else {
      toast.warning(`${successCount}/${rows.length} employees added. Check errors below.`)
    }
  }

  const statusLabel = (s: RowStatus): string => {
    switch (s.status) {
      case 'encrypting': return 'Encrypting…'
      case 'pending': return 'Sending…'
      case 'done': return 'Added'
      case 'error': return s.error || 'Failed'
      default: return ''
    }
  }

  const statusColor = (s: RowStatus): string => {
    switch (s.status) {
      case 'done': return 'text-primary'
      case 'error': return 'text-destructive'
      default: return 'text-muted-foreground'
    }
  }

  return (
    <Dialog open={open} onOpenChange={processing ? undefined : onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Batch add employees</DialogTitle>
          <DialogDescription>
            Add multiple employees at once. Each salary is encrypted individually.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 max-h-80 overflow-y-auto">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-6 tabular-nums">{i + 1}</span>
              <Input
                placeholder="0x... address"
                value={row.address}
                onChange={(e) => updateRow(i, 'address', e.target.value)}
                disabled={processing}
                className="flex-1 font-mono text-sm"
              />
              <Input
                type="number"
                placeholder="Salary"
                value={row.salary}
                onChange={(e) => updateRow(i, 'salary', e.target.value)}
                disabled={processing}
                className="w-28"
              />
              {rowStatuses[i] ? (
                <span className={`text-xs w-24 truncate ${statusColor(rowStatuses[i])}`}>
                  {currentIndex === i && rowStatuses[i].status !== 'done' && rowStatuses[i].status !== 'error' && (
                    <Loader2 className="inline size-3 animate-spin mr-1" />
                  )}
                  {statusLabel(rowStatuses[i])}
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(i)}
                  disabled={processing || rows.length <= 1}
                  className="size-8 p-0"
                  aria-label="Remove row"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {!processing && (
          <Button variant="ghost" size="sm" onClick={addRow} className="gap-1.5 w-fit">
            <Plus className="size-3.5" /> Add row
          </Button>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={processing}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={processing || !walletClient || rows.every(r => !r.address || !r.salary)}>
            {processing && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {processing ? `Processing ${currentIndex + 1}/${rows.length}…` : `Add ${rows.length} employees`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
