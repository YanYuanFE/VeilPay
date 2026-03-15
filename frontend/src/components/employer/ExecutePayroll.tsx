import { useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Lock, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfidentialPayrollABI, PayrollTokenABI, PAYROLL_MANAGER_ADDRESS, PAYROLL_TOKEN_ADDRESS } from '@/lib/contracts'
import { toast } from 'sonner'

export function ExecutePayroll() {
  const { address } = useAccount()
  const queryClient = useQueryClient()

  const { data: activeCount } = useReadContract({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'getActiveEmployeeCount',
  })

  const { data: isOp } = useReadContract({
    address: PAYROLL_TOKEN_ADDRESS as `0x${string}`,
    abi: PayrollTokenABI,
    functionName: 'isOperator',
    args: address ? [address as `0x${string}`, PAYROLL_MANAGER_ADDRESS as `0x${string}`] : undefined,
  })

  const { writeContract: approveOp, data: approveHash, isPending: isApproving } = useWriteContract()
  const { isLoading: isApproveConfirming, isSuccess: isApproved } = useWaitForTransactionReceipt({ hash: approveHash })

  const { writeContract: execPayroll, data: payrollHash, isPending: isExecuting } = useWriteContract()
  const { isLoading: isPayrollConfirming, isSuccess: isPayrollDone } = useWaitForTransactionReceipt({ hash: payrollHash })

  useEffect(() => {
    if (isApproved) {
      queryClient.invalidateQueries()
      toast.success('Operator approved successfully.')
    }
  }, [isApproved, queryClient])

  useEffect(() => {
    if (isPayrollDone) {
      queryClient.invalidateQueries()
      toast.success('Payroll executed. All transfers were confidential.')
    }
  }, [isPayrollDone, queryClient])

  const handleApproveOperator = () => {
    const until = Math.floor(Date.now() / 1000) + 365 * 24 * 3600
    approveOp({
      address: PAYROLL_TOKEN_ADDRESS as `0x${string}`,
      abi: PayrollTokenABI,
      functionName: 'setOperator',
      args: [PAYROLL_MANAGER_ADDRESS as `0x${string}`, until],
    })
  }

  const handleExecutePayroll = () => {
    execPayroll({
      address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
      abi: ConfidentialPayrollABI,
      functionName: 'executePayroll',
      gas: BigInt(15_000_000),
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Execute payroll</h3>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Transfer encrypted salary amounts to all active employees in one transaction.
        </p>
      </div>

      {/* Status rows */}
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Active employees</span>
          <span className="font-medium text-foreground tabular-nums">{activeCount?.toString() || '0'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total amount</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Lock className="size-3" /> Encrypted
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Operator approved</span>
          <span className={isOp ? 'text-primary font-medium' : 'text-amber-600 font-medium'}>
            {isOp ? 'Yes' : 'Needed'}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-2">
        {!isOp && !isApproved && (
          <Button
            onClick={handleApproveOperator}
            disabled={isApproving || isApproveConfirming}
            variant="outline"
            className="w-full"
          >
            {(isApproving || isApproveConfirming) && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Approve payroll contract as operator
          </Button>
        )}

        <Button
          onClick={handleExecutePayroll}
          disabled={isExecuting || isPayrollConfirming || Number(activeCount || 0) === 0}
          className="w-full"
        >
          {(isExecuting || isPayrollConfirming) ? (
            <>
              <Loader2 className="mr-1.5 size-4 animate-spin" />
              Processing
            </>
          ) : (
            <>Run payroll for {activeCount?.toString() || '0'} employees</>
          )}
        </Button>
      </div>

      {isPayrollDone && (
        <p className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          <Check className="size-4" />
          Payroll executed. All transfers were confidential.
        </p>
      )}
    </div>
  )
}
