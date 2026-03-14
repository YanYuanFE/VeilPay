import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { EmployerDashboard } from '@/components/employer/EmployerDashboard'
import { Wallet } from 'lucide-react'

export function EmployerPage() {
  const { isConnected } = useAccount()

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Wallet className="size-10 text-muted-foreground/50" strokeWidth={1.5} />
        <h2 className="text-lg font-semibold text-foreground">Connect your wallet</h2>
        <p className="text-sm text-muted-foreground">to access the employer dashboard</p>
        <div className="pt-2">
          <ConnectKitButton />
        </div>
      </div>
    )
  }

  return <EmployerDashboard />
}
