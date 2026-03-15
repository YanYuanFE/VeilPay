import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { Plus, Users, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfidentialPayrollABI, PayrollTokenABI, PAYROLL_MANAGER_ADDRESS, PAYROLL_TOKEN_ADDRESS } from '@/lib/contracts'
import { AddEmployeeDialog } from './AddEmployeeDialog'
import { BatchAddDialog } from './BatchAddDialog'
import { EmployeeTable } from './EmployeeTable'
import { ExecutePayroll } from './ExecutePayroll'
import { shortenAddress } from '@/lib/utils'

export function EmployerDashboard() {
  const { address } = useAccount()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false)

  const { data: employer, isLoading: isLoadingEmployer } = useReadContract({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'employer',
  })

  const { data: employeeCount } = useReadContract({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'getEmployeeCount',
  })

  const { data: activeCount } = useReadContract({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'getActiveEmployeeCount',
  })

  const { data: tokenSupply } = useReadContract({
    address: PAYROLL_TOKEN_ADDRESS as `0x${string}`,
    abi: PayrollTokenABI,
    functionName: 'totalSupply',
  })

  const isEmployer = employer && address && employer.toString().toLowerCase() === address.toLowerCase()

  if (isLoadingEmployer) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="size-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </div>
    )
  }

  if (!isEmployer) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <h2 className="text-lg font-semibold text-foreground">Access denied</h2>
        <p className="text-sm text-muted-foreground">
          Only the contract employer ({employer ? shortenAddress(String(employer)) : '\u2026'}) can access this page.
        </p>
        <p className="text-xs text-muted-foreground/60">Connected as {address ? shortenAddress(address) : '\u2026'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header row */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Employer dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage employees and execute encrypted payroll</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsBatchDialogOpen(true)} variant="outline" className="gap-1.5">
            <Users className="size-4" />
            Batch add
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)} className="gap-1.5">
            <Plus className="size-4" />
            Add employee
          </Button>
        </div>
      </div>

      {/* Stats -- flat text, no card wrappers */}
      <div className="flex gap-10 border-b border-border pb-6">
        {[
          { label: 'Total employees', value: employeeCount?.toString() || '0' },
          { label: 'Active', value: activeCount?.toString() || '0' },
          { label: 'Token supply (pUSD)', value: tokenSupply ? (Number(tokenSupply) / 1e6).toLocaleString() : '0' },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="payroll">Execute payroll</TabsTrigger>
        </TabsList>
        <TabsContent value="employees" className="mt-4">
          <EmployeeTable />
        </TabsContent>
        <TabsContent value="payroll" className="mt-4">
          <ExecutePayroll />
        </TabsContent>
      </Tabs>

      <AddEmployeeDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />
      <BatchAddDialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen} />
    </div>
  )
}
