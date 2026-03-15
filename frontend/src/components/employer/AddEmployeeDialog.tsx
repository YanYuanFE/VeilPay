import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { ConfidentialPayrollABI, PAYROLL_MANAGER_ADDRESS } from '@/lib/contracts'
import { encryptAmount } from '@/lib/fhe'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddEmployeeDialog({ open, onOpenChange }: Props) {
  const { address } = useAccount()
  const [employeeAddress, setEmployeeAddress] = useState('')
  const [salary, setSalary] = useState('')
  const [isEncrypting, setIsEncrypting] = useState(false)
  const [step, setStep] = useState('')
  const [error, setError] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const { writeContract, data: hash, isPending, error: txError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries()
      toast.success('Employee added successfully. Salary encrypted on-chain.')
      onOpenChange(false)
    }
  }, [isSuccess, queryClient, onOpenChange])

  const handleSubmit = async () => {
    if (!address || !employeeAddress || !salary) return
    if (!/^0x[0-9a-fA-F]{40}$/.test(employeeAddress)) {
      setError('Invalid address format')
      return
    }
    const salaryNum = parseFloat(salary)
    if (isNaN(salaryNum) || salaryNum <= 0) {
      setError('Salary must be a positive number')
      return
    }

    setError(null)
    setIsEncrypting(true)

    try {
      setStep('Initializing FHE SDK…')
      const salaryInUnits = BigInt(Math.round(salaryNum * 1e6))

      setStep('Encrypting salary (this may take a moment)…')
      const encrypted = await encryptAmount(PAYROLL_MANAGER_ADDRESS, address, salaryInUnits)

      setStep('Sending transaction…')
      setIsEncrypting(false)

      writeContract({
        address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
        abi: ConfidentialPayrollABI,
        functionName: 'addEmployee',
        args: [employeeAddress as `0x${string}`, encrypted.handles[0], encrypted.inputProof],
        gas: BigInt(15_000_000), // FHE ops need high gas; cap at 15M (under Sepolia's 16M limit)
      })
    } catch (err) {
      setIsEncrypting(false)
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      console.error('[AddEmployee] Error:', err)
    }
  }

  const isLoading = isEncrypting || isPending || isConfirming
  const displayError = error || (txError ? (txError as Error).message || 'Transaction failed' : null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
          <DialogDescription>
            The salary amount will be FHE-encrypted before it reaches the blockchain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="emp-address">Wallet address</Label>
            <Input
              id="emp-address"
              placeholder="0x..."
              value={employeeAddress}
              onChange={(e) => { setEmployeeAddress(e.target.value); setError(null) }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp-salary">
              Monthly salary (USD)
              <span className="ml-2 text-xs font-normal text-muted-foreground">encrypted on-chain</span>
            </Label>
            <Input
              id="emp-salary"
              type="number"
              placeholder="5000"
              value={salary}
              onChange={(e) => { setSalary(e.target.value); setError(null) }}
            />
          </div>
        </div>

        {isEncrypting && step && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {step}
          </p>
        )}

        {isSuccess && (
          <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
            Employee added. Salary encrypted on-chain.
          </p>
        )}

        {displayError && !isSuccess && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive break-all">
            {displayError}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isLoading || !employeeAddress || !salary}>
            {isLoading && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {isEncrypting ? 'Encrypting…' : isPending ? 'Confirming…' : isConfirming ? 'Processing…' : 'Add employee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
