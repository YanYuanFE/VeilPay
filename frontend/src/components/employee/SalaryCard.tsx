import { useState } from 'react'
import { useAccount, useReadContract, useWalletClient } from 'wagmi'
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfidentialPayrollABI, PayrollTokenABI, PAYROLL_MANAGER_ADDRESS, PAYROLL_TOKEN_ADDRESS } from '@/lib/contracts'
import { handleToHex, decryptValue } from '@/lib/fhe'
import { formatTokenAmount } from '@/lib/utils'
import { toast } from 'sonner'

export function SalaryCard() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [decryptError, setDecryptError] = useState<string | null>(null)
  const [decryptedSalary, setDecryptedSalary] = useState<string | null>(null)
  const [decryptedBalance, setDecryptedBalance] = useState<string | null>(null)
  const [showSalary, setShowSalary] = useState(false)
  const [showBalance, setShowBalance] = useState(false)

  // These return encrypted handles (uint256) — ciphertext pointers, not values
  // `account` is required so msg.sender is set correctly in the static call
  const { data: salaryHandle } = useReadContract({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'getMySalary',
    account: address,
    query: { enabled: !!address },
  })

  const { data: balanceHandle } = useReadContract({
    address: PAYROLL_TOKEN_ADDRESS as `0x${string}`,
    abi: PayrollTokenABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    account: address,
    query: { enabled: !!address },
  })


  const handleDecryptSalary = async () => {
    if (decryptedSalary) {
      setShowSalary(!showSalary)
      return
    }
    if (!salaryHandle || !walletClient) return

    setIsDecrypting(true)
    setDecryptError(null)
    try {
      const hexHandle = handleToHex(salaryHandle as bigint)
      const clearValue = await decryptValue(hexHandle, PAYROLL_MANAGER_ADDRESS, walletClient)
      setDecryptedSalary(formatTokenAmount(BigInt(clearValue)))
      setShowSalary(true)
      toast.success('Salary decrypted successfully.')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Decryption failed'
      setDecryptError(msg)
      toast.error('Failed to decrypt salary.')
    } finally {
      setIsDecrypting(false)
    }
  }

  const handleDecryptBalance = async () => {
    if (decryptedBalance) {
      setShowBalance(!showBalance)
      return
    }
    if (!balanceHandle || !walletClient) return

    setIsDecrypting(true)
    setDecryptError(null)
    try {
      const hexHandle = handleToHex(balanceHandle as bigint)
      const clearValue = await decryptValue(hexHandle, PAYROLL_TOKEN_ADDRESS, walletClient)
      setDecryptedBalance(formatTokenAmount(BigInt(clearValue)))
      setShowBalance(true)
      toast.success('Balance decrypted successfully.')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Decryption failed'
      setDecryptError(msg)
      toast.error('Failed to decrypt balance.')
    } finally {
      setIsDecrypting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Salary */}
        <div className="rounded-lg border border-border p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Monthly salary</h3>
            <p className="text-xs text-muted-foreground">FHE-encrypted on-chain</p>
          </div>
          <div className="flex items-center gap-3">
            {showSalary && decryptedSalary ? (
              <span className="text-3xl font-bold text-foreground tabular-nums">{decryptedSalary}</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Lock className="size-4" /> Encrypted
              </span>
            )}
          </div>
          <Button
            onClick={handleDecryptSalary}
            disabled={isDecrypting || !walletClient}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            {isDecrypting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : showSalary ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
            {isDecrypting ? 'Decrypting…' : showSalary ? 'Hide' : 'Decrypt & view'}
          </Button>
        </div>

        {/* Balance */}
        <div className="rounded-lg border border-border p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Token balance (pUSD)</h3>
            <p className="text-xs text-muted-foreground">Confidential balance</p>
          </div>
          <div className="flex items-center gap-3">
            {showBalance && decryptedBalance ? (
              <span className="text-3xl font-bold text-foreground tabular-nums">{decryptedBalance}</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Lock className="size-4" /> Encrypted
              </span>
            )}
          </div>
          <Button
            onClick={handleDecryptBalance}
            disabled={isDecrypting || !walletClient}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            {isDecrypting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : showBalance ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
            {isDecrypting ? 'Decrypting…' : showBalance ? 'Hide' : 'Decrypt & view'}
          </Button>
        </div>
      </div>

      {decryptError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {decryptError}
        </p>
      )}
    </div>
  )
}
