import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createAuthenticationAdapter, darkTheme, lightTheme, RainbowKitAuthenticationProvider, RainbowKitProvider,
} from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { isAddressEqual, type Address, type WalletClient } from 'viem'
import { createSiweMessage } from 'viem/siwe'
import { useAccount, useWalletClient, WagmiProvider } from 'wagmi'
import { api } from './api'
import { reportError } from './format'
import { loadAssets } from './veilpay/chain'
import { arc, SEED_MESSAGE } from './veilpay/config'
import { ready, seedFromSignature, walletFromSeed, type Wallet } from './veilpay/crypto'
import { ThemeProvider, useTheme } from './theme'
import { wagmiConfig } from './wagmi'

export type Me = {
  address: Address | null
  orgs: { id: string; name: string; asset: string; created_at: string }[]
  memberships: { id: string; name: string; org_id: string; org_name: string; owner_tag: string | null; joined_at: string | null }[]
}

type Session = {
  me: Me | null
  /** Connected and signed in with the same address. */
  signedIn: boolean
  client: WalletClient | null
  account: Address | null
  veil: Wallet | null
  /** Derives VeilPay keys from a wallet signature (cached for this tab). */
  unlock: () => Promise<Wallet>
  refresh: () => Promise<void>
}

const SessionContext = createContext<Session | null>(null)
const queryClient = new QueryClient()

const seedKey = (a: Address) => `vp_seed:${a.toLowerCase()}`
const deterministicKey = (a: Address) => `vp_deterministic:${a.toLowerCase()}`

function readCachedSeed(a: Address): Uint8Array | null {
  // ponytail: tab-scoped sessionStorage cache; XSS can read it just like it could request a signature.
  const hex = sessionStorage.getItem(seedKey(a))
  return hex ? Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16))) : null
}

function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [sodiumReady, setSodiumReady] = useState(false)
  const [keys, setKeys] = useState<{ address: Address; wallet: Wallet } | null>(null)
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()

  const refresh = useCallback(async () => {
    const me = await api<Me>('/me')
    if (me.address) await loadAssets(me.orgs.map((o) => o.asset)) // signed out: /me returns only { address: null }
    setMe(me)
  }, [])

  useEffect(() => {
    Promise.all([ready.then(() => setSodiumReady(true)), refresh()]).catch(reportError)
  }, [refresh])

  const signedIn = Boolean(me?.address && address && isAddressEqual(me.address, address))

  const signOut = useCallback(async () => {
    if (me?.address) sessionStorage.removeItem(seedKey(me.address))
    setKeys(null)
    await api('/auth/logout', { method: 'POST' })
    await refresh()
  }, [me, refresh])

  // A session for a different address than the connected one is stale (wallet account switched).
  useEffect(() => {
    if (me?.address && address && !isAddressEqual(me.address, address)) signOut().catch(reportError)
  }, [me, address, signOut])

  const adapter = useMemo(() => createAuthenticationAdapter({
    getNonce: async () => (await api<{ nonce: string }>('/auth/nonce')).nonce,
    createMessage: ({ nonce, address: a, chainId }) => createSiweMessage({
      domain: window.location.host, address: a, statement: 'Sign in to VeilPay.', uri: window.location.origin,
      version: '1', chainId, nonce,
    }),
    verify: async ({ message, signature }) => {
      try {
        await api('/auth/verify', { method: 'POST', body: { message, signature } })
        await refresh()
        return true
      } catch (err) {
        reportError(err) // UI boundary: RainbowKit only accepts a boolean here
        return false
      }
    },
    signOut,
  }), [refresh, signOut])

  const veil = useMemo(() => {
    if (!signedIn || !address || !sodiumReady) return null
    if (keys && isAddressEqual(keys.address, address)) return keys.wallet
    const seed = readCachedSeed(address)
    return seed ? walletFromSeed(seed) : null
  }, [signedIn, address, sodiumReady, keys])

  const unlock = useCallback(async () => {
    if (veil) return veil
    if (!walletClient || !address || !signedIn) throw new Error('connect and sign in first')
    const sig = await walletClient.signMessage({ account: address, message: SEED_MESSAGE })
    if (localStorage.getItem(deterministicKey(address)) !== '1') {
      // keys must be re-derivable later; refuse wallets whose signatures change between calls
      const again = await walletClient.signMessage({ account: address, message: SEED_MESSAGE })
      if (again !== sig) {
        throw new Error('This wallet produces non-deterministic signatures, so VeilPay keys could not be recovered from it. Use a standard EOA wallet such as MetaMask.')
      }
      localStorage.setItem(deterministicKey(address), '1')
    }
    const seed = seedFromSignature(sig)
    sessionStorage.setItem(seedKey(address), Array.from(seed, (b) => b.toString(16).padStart(2, '0')).join(''))
    const w = walletFromSeed(seed)
    setKeys({ address, wallet: w })
    return w
  }, [veil, walletClient, address, signedIn])

  const { theme } = useTheme()
  const rkTheme = useMemo(() => (theme === 'dark'
    ? darkTheme({ accentColor: '#f75a2e', accentColorForeground: '#0a0d13', borderRadius: 'small', overlayBlur: 'small' })
    : lightTheme({ accentColor: '#de3f20', accentColorForeground: '#fafcfb', borderRadius: 'small', overlayBlur: 'small' })), [theme])
  const status = me === null ? 'loading' : signedIn ? 'authenticated' : 'unauthenticated'
  const value = useMemo<Session>(() => ({
    me, signedIn, client: signedIn ? walletClient ?? null : null, account: signedIn ? address! : null, veil, unlock, refresh,
  }), [me, signedIn, walletClient, address, veil, unlock, refresh])

  return (
    <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
      <RainbowKitProvider locale="en-US" initialChain={arc} theme={rkTheme}>
        <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
      </RainbowKitProvider>
    </RainbowKitAuthenticationProvider>
  )
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>{children}</SessionProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  )
}

export function useSession(): Session {
  const s = useContext(SessionContext)
  if (!s) throw new Error('useSession outside Providers')
  return s
}
