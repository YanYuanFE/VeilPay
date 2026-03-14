import { useState, useCallback } from 'react'
import { encryptAmount, decryptValue } from '@/lib/fhe'

export function useFHE() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const encrypt = useCallback(async (contractAddress: string, userAddress: string, amount: bigint) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await encryptAmount(contractAddress, userAddress, amount)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Encryption failed'
      setError(msg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const decrypt = useCallback(async (handle: string, contractAddress: string, signer: unknown) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await decryptValue(handle, contractAddress, signer)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Decryption failed'
      setError(msg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { encrypt, decrypt, isLoading, error }
}
