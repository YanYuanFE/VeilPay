/* eslint-disable @typescript-eslint/no-explicit-any */

import { SEPOLIA_RPC_URL } from './contracts'

// FHE instance via CDN-loaded @zama-fhe/relayer-sdk (window.relayerSDK)

let fheInstance: any = null
let initPromise: Promise<any> | null = null

function getSDK(): any {
  return (window as any).relayerSDK
}

export async function getFHEInstance() {
  if (fheInstance) return fheInstance

  // Prevent race condition: reuse the same promise for concurrent callers
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const sdk = getSDK()
      if (!sdk) {
        throw new Error(
          'relayer-sdk not loaded. Check that the CDN script is in index.html.',
        )
      }

      if (typeof sdk.initSDK === 'function') {
        await sdk.initSDK()
      }

      const config = {
        ...sdk.SepoliaConfig,
        network: SEPOLIA_RPC_URL,
      }

      const instance = await sdk.createInstance(config)
      if (!instance) throw new Error('createInstance returned null')

      fheInstance = instance
      return instance
    } catch (err) {
      // Reset so next call retries
      initPromise = null
      throw err
    }
  })()

  return initPromise
}

export async function encryptAmount(
  contractAddress: string,
  userAddress: string,
  amount: bigint,
) {
  const instance = await getFHEInstance()
  const input = instance.createEncryptedInput(contractAddress, userAddress)
  input.add64(amount)
  const encrypted = await input.encrypt()

  return {
    handles: [toHex(encrypted.handles[0])],
    inputProof: toHex(encrypted.inputProof),
  }
}

function toHex(bytes: Uint8Array | string): `0x${string}` {
  if (typeof bytes === 'string') {
    return bytes.startsWith('0x') ? (bytes as `0x${string}`) : `0x${bytes}`
  }
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * Convert a uint256 bigint handle (from contract read) to a 0x-prefixed
 * bytes32 hex string that the relayer-sdk expects.
 */
export function handleToHex(handle: bigint): string {
  return '0x' + handle.toString(16).padStart(64, '0')
}

/**
 * Decrypt an encrypted value using the KMS re-encryption flow.
 *
 * @param handleHex  - bytes32 hex string of the ciphertext handle
 * @param contractAddress - the contract that owns the ciphertext
 * @param walletClient - viem WalletClient (from wagmi useWalletClient)
 */
export async function decryptValue(
  handleHex: string,
  contractAddress: string,
  walletClient: any,
) {
  const instance = await getFHEInstance()
  const keypair = instance.generateKeypair()
  const startTime = Math.floor(Date.now() / 1000)
  const duration = 1 // 1 day

  // SDK returns { domain, types, message, primaryType? }
  const eip712 = instance.createEIP712(
    keypair.publicKey,
    [contractAddress],
    startTime,
    duration,
  )

  // Determine primaryType: the key in types that isn't 'EIP712Domain'
  const primaryType =
    eip712.primaryType ||
    Object.keys(eip712.types).find((k: string) => k !== 'EIP712Domain') ||
    'UserDecryptRequest'

  // Sign with viem walletClient (different API from ethers signer)
  const signature: string = await walletClient.signTypedData({
    account: walletClient.account,
    domain: eip712.domain,
    types: eip712.types,
    primaryType,
    message: eip712.message,
  })

  const result = await instance.userDecrypt(
    [{ handle: handleHex, contractAddress }],
    keypair.privateKey,
    keypair.publicKey,
    signature.replace('0x', ''),
    [contractAddress],
    walletClient.account.address,
    startTime,
    duration,
  )

  return result[handleHex]
}
