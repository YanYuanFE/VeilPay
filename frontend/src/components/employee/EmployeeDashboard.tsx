import { useAccount, useReadContract } from 'wagmi'
import { ConfidentialPayrollABI, PAYROLL_MANAGER_ADDRESS } from '@/lib/contracts'
import { SalaryCard } from './SalaryCard'
import { PaymentHistory } from './PaymentHistory'
import { formatTimestamp, shortenAddress } from '@/lib/utils'

export function EmployeeDashboard() {
  const { address } = useAccount()

  const { data: isEmployee } = useReadContract({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'isEmployee',
    args: address ? [address as `0x${string}`] : undefined,
  })

  const { data: employeeInfo } = useReadContract({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'getEmployeeInfo',
    args: address ? [address as `0x${string}`] : undefined,
  })

  if (!isEmployee) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <h2 className="text-lg font-semibold text-foreground">Not registered</h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Your wallet is not registered as an employee in the payroll system.
        </p>
        <p className="text-xs text-muted-foreground/60">
          Connected as {address ? shortenAddress(address) : '…'}
        </p>
      </div>
    )
  }

  const info = employeeInfo as [boolean, bigint, bigint] | undefined

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Employee dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">View your confidential salary and payment history</p>
      </div>

      {/* Status row — flat text stats */}
      <div className="flex gap-10 border-b border-border pb-6">
        {[
          { label: 'Status', value: info?.[0] ? 'Active' : 'Inactive', accent: info?.[0] },
          { label: 'Last payment', value: info ? formatTimestamp(Number(info[1])) : '…' },
          { label: 'Enrolled since', value: info ? formatTimestamp(Number(info[2])) : '…' },
        ].map(({ label, value, accent }) => (
          <div key={label}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`mt-1 text-base font-semibold tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <SalaryCard />
      <PaymentHistory />
    </div>
  )
}
