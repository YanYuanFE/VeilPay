import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ConfidentialPayrollABI, PAYROLL_MANAGER_ADDRESS } from '@/lib/contracts'

export function usePayrollContract() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const useEmployer = () => useReadContract({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'employer',
  })

  const useEmployeeCount = () => useReadContract({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'getEmployeeCount',
  })

  const useActiveEmployeeCount = () => useReadContract({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'getActiveEmployeeCount',
  })

  const useIsEmployee = (address: `0x${string}` | undefined) => useReadContract({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'isEmployee',
    args: address ? [address] : undefined,
  })

  const useEmployeeInfo = (address: `0x${string}` | undefined) => useReadContract({
    address: PAYROLL_MANAGER_ADDRESS as `0x${string}`,
    abi: ConfidentialPayrollABI,
    functionName: 'getEmployeeInfo',
    args: address ? [address] : undefined,
  })

  return {
    writeContract,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    useEmployer,
    useEmployeeCount,
    useActiveEmployeeCount,
    useIsEmployee,
    useEmployeeInfo,
  }
}
