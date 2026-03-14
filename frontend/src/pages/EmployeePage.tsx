import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { EmployeeDashboard } from '@/components/employee/EmployeeDashboard'
import { Wallet } from 'lucide-react'

export function EmployeePage() {
  const { isConnected } = useAccount()

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Wallet className="size-10 text-muted-foreground/50" strokeWidth={1.5} />
        <h2 className="text-lg font-semibold text-foreground">Connect your wallet</h2>
        <p className="text-sm text-muted-foreground">to view your salary and payment history</p>
        <div className="pt-2">
          <ConnectKitButton />
        </div>
      </div>
    )
  }

  return <EmployeeDashboard />
}
