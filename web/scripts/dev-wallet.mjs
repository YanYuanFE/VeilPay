// Dev-only EIP-1193 signer for browser E2E tests without a wallet extension.
// Usage: PRIVATE_KEY=0x.. node scripts/dev-wallet.mjs   (listens on 127.0.0.1:5191)
// Accounts: "employer" = PRIVATE_KEY; other labels are keys derived from it (keccak(PRIVATE_KEY:label)).
// The page gets a tiny provider (see PROVIDER_SNIPPET) that POSTs { account, method, params } here.
import { createServer } from 'node:http'
import { createPublicClient, createWalletClient, http, keccak256, stringToBytes, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const RPC = 'https://rpc.testnet.arc.io'
const CHAIN = { id: 5042002, name: 'Arc Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const ORIGIN = 'http://localhost:5190'
const root = process.env.PRIVATE_KEY
if (!root) throw new Error('PRIVATE_KEY required')

const keyFor = (label) => (label === 'employer' ? root : keccak256(stringToBytes(`${root}:veilpay.dev-wallet:${label}`)))
const accounts = new Map()
function wallet(label) {
  if (!/^[a-z0-9-]{1,32}$/.test(label)) throw new Error('bad account label')
  if (!accounts.has(label)) {
    const account = privateKeyToAccount(keyFor(label))
    accounts.set(label, { account, client: createWalletClient({ account, chain: CHAIN, transport: http(RPC) }) })
  }
  return accounts.get(label)
}
const pub = createPublicClient({ chain: CHAIN, transport: http(RPC) })

async function handle({ account: label, method, params = [] }) {
  const { account, client } = wallet(label)
  switch (method) {
    case 'eth_requestAccounts':
    case 'eth_accounts':
      return [account.address]
    case 'eth_chainId':
      return toHex(CHAIN.id)
    case 'wallet_switchEthereumChain':
    case 'wallet_addEthereumChain':
      return null
    case 'personal_sign':
      return account.signMessage({ message: { raw: params[0] } })
    case 'eth_sendTransaction': {
      const tx = params[0]
      return client.sendTransaction({
        to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined, gas: tx.gas ? BigInt(tx.gas) : undefined,
      })
    }
    default:
      return pub.request({ method, params })
  }
}

// Address lookup for test setup: node scripts/dev-wallet.mjs --address <label>
if (process.argv[2] === '--address') {
  console.log(wallet(process.argv[3]).account.address)
  process.exit(0)
}

createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', ORIGIN)
  res.setHeader('access-control-allow-headers', 'content-type')
  if (req.method === 'OPTIONS') return res.end()
  let body = ''
  for await (const c of req) body += c
  const msg = JSON.parse(body)
  try {
    const result = await handle(msg)
    res.end(JSON.stringify({ result }, (_k, v) => (typeof v === 'bigint' ? toHex(v) : v)))
  } catch (err) {
    console.error(msg.method, err.shortMessage ?? err.message)
    res.end(JSON.stringify({ error: { code: err.code ?? -32000, message: err.shortMessage ?? err.message } }))
  }
}).listen(5191, '127.0.0.1', () => console.log('dev wallet on 127.0.0.1:5191'))

