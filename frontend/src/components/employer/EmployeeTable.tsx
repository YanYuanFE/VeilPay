import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Lock, UserMinus } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfidentialPayrollABI, PAYROLL_MANAGER_ADDRESS } from '@/lib/contracts'
import { shortenAddress, formatTimestamp } from '@/lib/utils'
import { toast } from 'sonner'

const MAX_DISPLAY = 50

export function EmployeeTable() {
  const queryClient = useQueryClient()

  const { data: count } = useReadContract({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'getEmployeeCount',
  })

  const employeeCount = Number(count || 0)
  const displayCount = Math.min(employeeCount, MAX_DISPLAY)

  const addressCalls = Array.from({ length: displayCount }, (_, i) => ({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'employeeList' as const,
    args: [BigInt(i)],
  }))

  const { data: addressResults } = useReadContracts({
    contracts: addressCalls,
    query: { enabled: displayCount > 0 },
  })

  const addresses = (addressResults || [])
    .map((r) => r.status === 'success' ? r.result as string : null)
    .filter(Boolean) as string[]

  const infoCalls = addresses.map((addr) => ({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'getEmployeeInfo' as const,
    args: [addr as `0x${string}`],
  }))

  const { data: infoResults } = useReadContracts({
    contracts: infoCalls,
    query: { enabled: addresses.length > 0 },
  })

  const employees = addresses.map((addr, i) => {
    const info = infoResults?.[i]
    if (!info || info.status !== 'success') {
      return { address: addr, isActive: false, lastPaid: 0, addedAt: 0 }
    }
    const [isActive, lastPaid, addedAt] = info.result as [boolean, bigint, bigint]
    return { address: addr, isActive, lastPaid: Number(lastPaid), addedAt: Number(addedAt) }
  })

  // Remove employee
  const { writeContract, data: removeHash, isPending: isRemoving } = useWriteContract()
  const { isSuccess: isRemoved } = useWaitForTransactionReceipt({ hash: removeHash })

  useEffect(() => {
    if (isRemoved) {
      queryClient.invalidateQueries()
      toast.success('Employee removed.')
    }
  }, [isRemoved, queryClient])

  const handleRemove = (empAddress: string) => {
    writeContract({
      address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
      abi: ConfidentialPayrollABI,
      functionName: 'removeEmployee',
      args: [empAddress as `0x${string}`],
    })
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Address</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Salary</TableHead>
            <TableHead>Last paid</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employeeCount === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-32 text-center">
                <p className="text-sm text-muted-foreground">No employees yet</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Add your first employee to get started
                </p>
              </TableCell>
            </TableRow>
          ) : employees.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-32 text-center">
                <p className="text-sm text-muted-foreground">Loading employees...</p>
              </TableCell>
            </TableRow>
          ) : (
            employees.map((emp) => (
              <TableRow key={emp.address}>
                <TableCell className="font-mono text-sm">{shortenAddress(emp.address)}</TableCell>
                <TableCell>
                  <Badge variant={emp.isActive ? 'default' : 'secondary'} className="text-xs">
                    {emp.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="size-3" /> Encrypted
                  </span>
                </TableCell>
                <TableCell className="tabular-nums text-sm">
                  {formatTimestamp(emp.lastPaid)}
                </TableCell>
                <TableCell className="tabular-nums text-sm">
                  {formatTimestamp(emp.addedAt)}
                </TableCell>
                <TableCell className="text-right">
                  {emp.isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(emp.address)}
                      disabled={isRemoving}
                      className="gap-1.5 text-destructive hover:text-destructive"
                    >
                      <UserMinus className="size-3.5" />
                      Remove
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
