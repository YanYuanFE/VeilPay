import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { PayrollTokenABI, PAYROLL_TOKEN_ADDRESS } from '@/lib/contracts'

export function useTokenContract() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const useTotalSupply = () => useReadContract({
    address: PAYROLL_TOKEN_ADDRESS as `0x${string}`,
    abi: PayrollTokenABI,
    functionName: 'totalSupply',
  })

  const useIsOperator = (holder: `0x${string}` | undefined, operator: `0x${string}`) => useReadContract({
    address: PAYROLL_TOKEN_ADDRESS as `0x${string}`,
    abi: PayrollTokenABI,
    functionName: 'isOperator',
    args: holder ? [holder, operator] : undefined,
  })

  const useConfidentialBalance = (account: `0x${string}` | undefined) => useReadContract({
    address: PAYROLL_TOKEN_ADDRESS as `0x${string}`,
    abi: PayrollTokenABI,
    functionName: 'confidentialBalanceOf',
    args: account ? [account] : undefined,
  })

  return {
    writeContract,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    useTotalSupply,
    useIsOperator,
    useConfidentialBalance,
  }
}
