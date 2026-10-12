import { connectorsForWallets, getDefaultConfig } from '@rainbow-me/rainbowkit'
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets'
import { createConfig, http } from 'wagmi'
import { arcTestnet } from './veilpay/config'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined
const appName = 'VeilPay'

function browserWalletsOnly() {
  console.warn('VITE_WALLETCONNECT_PROJECT_ID is not set: only browser-extension wallets are offered (no WalletConnect / mobile).')
  // injectedWallet never talks to WalletConnect, so the project id below is never used
  const connectors = connectorsForWallets([{ groupName: 'Browser wallet', wallets: [injectedWallet] }], { appName, projectId: 'unused' })
  return createConfig({ connectors, chains: [arcTestnet], transports: { [arcTestnet.id]: http() } })
}

export const wagmiConfig = projectId
  ? getDefaultConfig({ appName, projectId, chains: [arcTestnet], transports: { [arcTestnet.id]: http() } })
  : browserWalletsOnly()
