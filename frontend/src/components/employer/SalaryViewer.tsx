import { useState } from 'react'
import { useWalletClient } from 'wagmi'
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { decryptValue } from '@/lib/fhe'
import { formatTokenAmount } from '@/lib/utils'
import { PAYROLL_MANAGER_ADDRESS } from '@/lib/contracts'

interface Props {
  handle: string
}

export function SalaryViewer({ handle }: Props) {
  const { data: walletClient } = useWalletClient()
  const [decryptedVal, setDecryptedVal] = useState<bigint | null>(null)
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  const handleDecrypt = async () => {
    if (decryptedVal !== null) {
      setIsVisible(!isVisible)
      return
    }
    if (!walletClient) return
    setIsDecrypting(true)
    try {
      const value = await decryptValue(handle, PAYROLL_MANAGER_ADDRESS, walletClient)
      if (value != null) {
        setDecryptedVal(BigInt(value))
        setIsVisible(true)
      }
    } catch (error) {
      console.error('Decryption error:', error)
    } finally {
      setIsDecrypting(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {isVisible && decryptedVal !== null ? (
        <span className="font-medium text-foreground tabular-nums">{formatTokenAmount(decryptedVal)}</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
          <Lock className="size-3" /> Encrypted
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDecrypt}
        disabled={isDecrypting || !walletClient}
        className="size-7 p-0"
        aria-label={isVisible ? 'Hide salary' : 'Reveal salary'}
      >
        {isDecrypting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : isVisible ? (
          <EyeOff className="size-3.5" />
        ) : (
          <Eye className="size-3.5" />
        )}
      </Button>
    </span>
  )
}
