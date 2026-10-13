import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowUpRight, Info, TriangleAlert } from 'lucide-react'
import { cn } from 'cn'
import { EURC, EXPLORER, PERMIT2, USDC, VAULT, VAULT_DEPLOY_BLOCK, arc } from '@/lib/veilpay/config'

const VERIFIER = '0x231a8Ab940cdf3d941b23f41f39F11dD579be31E'
const POSEIDON = '0x05357D9598ff47DEA70B04d4C585AF5BC592F344'

const TOC: { id: string; title: string; children?: { id: string; title: string }[] }[] = [
  { id: 'overview', title: 'Overview' },
  {
    id: 'quickstart', title: 'Quickstart', children: [
      { id: 'employers', title: 'Employers' },
      { id: 'employees', title: 'Employees' },
      { id: 'verifiers', title: 'Verifiers' },
    ],
  },
  {
    id: 'how', title: 'How it works', children: [
      { id: 'notes', title: 'Notes and commitments' },
      { id: 'circuit', title: 'The transaction circuit' },
      { id: 'tree', title: 'Merkle tree and nullifiers' },
      { id: 'binding', title: 'Binding and replay protection' },
      { id: 'keys', title: 'Keys' },
      { id: 'encryption', title: 'Note encryption' },
      { id: 'batch', title: 'Batch payroll and resume' },
      { id: 'index', title: 'Event index' },
    ],
  },
  { id: 'privacy', title: 'Privacy model' },
  { id: 'disclosure', title: 'Verification links' },
  { id: 'contracts', title: 'Contracts and network' },
  { id: 'api', title: 'API reference' },
  { id: 'security', title: 'Security and limits' },
  { id: 'faq', title: 'FAQ' },
]

// ---------- building blocks ----------

function Section({ id, title, eyebrow, children }: { id: string; title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-hairline pt-14 first:border-t-0 first:pt-0">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="mt-3 text-3xl leading-tight md:text-4xl">{title}</h2>
      <div className="mt-6 space-y-5">{children}</div>
    </section>
  )
}

function Sub({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24 space-y-4 pt-6">
      <h3 className="font-sans text-lg font-medium">{title}</h3>
      {children}
    </div>
  )
}

const P = ({ children }: { children: ReactNode }) => <p className="leading-relaxed text-bone/80">{children}</p>
const C = ({ children }: { children: ReactNode }) => <code className="num rounded bg-muted px-1.5 py-0.5 text-[0.85em] text-bone">{children}</code>

function Pre({ children }: { children: string }) {
  return <pre className="num overflow-x-auto rounded-lg border border-hairline bg-card p-4 text-[0.8125rem] leading-relaxed text-bone/90">{children}</pre>
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((it, i) => (
        <li key={i} className="grid grid-cols-[2rem_1fr] gap-3 leading-relaxed text-bone/80">
          <span className="num pt-0.5 text-sm text-seal">{String(i + 1).padStart(2, '0')}</span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  )
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 leading-relaxed text-bone/80">
          <span className="mt-[0.7rem] h-px w-3 shrink-0 bg-bone/40" aria-hidden="true" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-hairline">
      <table className="w-full text-left text-sm">
        <thead className="bg-card">
          <tr>{head.map((h) => <th key={h} className="eyebrow px-4 py-3 font-normal">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-hairline align-top">
              {r.map((c, j) => <td key={j} className={cn('px-4 py-3 leading-relaxed', j === 0 ? 'text-bone' : 'text-bone/75')}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'warn'; title: string; children: ReactNode }) {
  const Icon = tone === 'warn' ? TriangleAlert : Info
  return (
    <div className={cn('rounded-lg border p-4', tone === 'warn' ? 'border-seal/40 bg-seal/5' : 'border-hairline bg-card')}>
      <p className={cn('flex items-center gap-2 text-sm font-medium', tone === 'warn' ? 'text-seal' : 'text-bone')}><Icon className="size-4" /> {title}</p>
      <div className="mt-2 text-sm leading-relaxed text-bone/75">{children}</div>
    </div>
  )
}

const Ext = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline decoration-hairline underline-offset-4 hover:text-seal">
    {children}<ArrowUpRight className="size-3" />
  </a>
)

const addr = (a: string) => <Ext href={`${EXPLORER}/address/${a}`}><span className="num break-all">{a}</span></Ext>

// ---------- table of contents ----------

/** The last section (in document order) whose top has scrolled past the sticky header. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      let current = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= 120) current = id
      }
      setActive(current)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [ids])
  return active
}

const ALL_IDS = TOC.flatMap((t) => [t.id, ...(t.children ?? []).map((c) => c.id)])

function Toc({ active }: { active: string }) {
  const link = (id: string, title: string, nested = false) => (
    <a
      href={`#${id}`}
      className={cn(
        'block border-l py-1 transition-colors hover:text-foreground',
        nested ? 'pl-6 text-[0.8125rem]' : 'pl-4',
        active === id ? 'border-seal text-foreground' : 'border-hairline text-muted-foreground',
      )}
    >
      {title}
    </a>
  )
  return (
    <nav aria-label="Documentation" className="text-sm">
      <p className="eyebrow mb-3 pl-4">On this page</p>
      {TOC.map((t) => (
        <div key={t.id}>
          {link(t.id, t.title)}
          {t.children?.map((c) => <div key={c.id}>{link(c.id, c.title, true)}</div>)}
        </div>
      ))}
    </nav>
  )
}

// ---------- page ----------

export function DocsPage() {
  const active = useActiveSection(ALL_IDS)
  return (
    <div className="grid gap-12 lg:grid-cols-[13rem_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100svh-7rem)] overflow-y-auto pb-8"><Toc active={active} /></div>
      </aside>

      <article className="min-w-0 max-w-3xl space-y-14 pb-24">
        <header className="animate-rise">
          <p className="eyebrow">Documentation</p>
          <h1 className="mt-3 text-5xl leading-none md:text-6xl">VeilPay docs</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            How private payroll on Arc works, how to use it as an employer, employee or verifier,
            and exactly what is and isn't hidden.
          </p>
          <details className="mt-8 rounded-lg border border-hairline bg-card p-4 lg:hidden">
            <summary className="cursor-pointer text-sm">Contents</summary>
            <div className="mt-4"><Toc active={active} /></div>
          </details>
        </header>

        <Section id="overview" title="Overview">
          <P>
            VeilPay lets an organization pay its team in USDC or EURC on Arc without publishing who earned what. Each
            organization picks its payroll token when it is created. The employer deposits that token into a vault once; payroll then moves value between encrypted <em>notes</em> inside
            the vault, and each employee withdraws when they choose. A zero-knowledge proof accompanies every vault
            transaction and proves that value is conserved and each note is spent at most once, so the chain can enforce the
            rules without seeing the amounts.
          </P>
          <Table
            head={['Role', 'What they do', 'What they learn']}
            rows={[
              ['Employer', 'Creates an organization, invites people, deposits, runs payroll', 'Everything about their own payroll'],
              ['Employee', 'Accepts an invite, receives notes, withdraws, shares proofs', 'Only their own payments'],
              ['Verifier', 'Opens a verification link from an employee', 'One payment the employee chose to share'],
              ['Everyone else', 'Reads the public chain', 'That deposits, payroll transactions and withdrawals happened; deposit and withdrawal amounts'],
            ]}
          />
          <Callout tone="warn" title="Early, unaudited">
            VeilPay runs on {arc.name} (chain id {arc.id}). The Groth16 parameters come from a single-party setup and neither the
            circuit nor the contracts have been audited. Use small amounts only.
          </Callout>
        </Section>

        <Section id="quickstart" title="Quickstart" eyebrow="Guides">
          <P>
            You need a browser wallet on {arc.name} with a little USDC for gas (Arc pays gas in USDC). A standard
            EOA wallet such as MetaMask works; see <a className="underline underline-offset-4" href="#keys">Keys</a> for why some
            smart-contract and MPC wallets are refused.
          </P>

          <Sub id="employers" title="Employers">
            <Steps items={[
              <>Open <Link className="underline underline-offset-4" to="/app">the app</Link>, connect your wallet and sign the sign-in message.</>,
              <>Create an organization and choose its payroll token: USDC, EURC, or any other ERC-20 on Arc by address (the first organization to use a new token registers it on the vault with one transaction). It can't be changed later. VeilPay asks you to unlock your private keys (the first time, you sign the same message twice); the organization's treasury is owned by these keys.</>,
              <>In <b>Treasury</b>, deposit the organization's token. Each deposit is a single EIP-3009 signature with no approval transaction (tokens without EIP-3009 use Permit2 after a one-time approval). USDC deposits are submitted by the VeilPay relayer, which takes a small fee from the deposit; EURC deposits are sent from your wallet. The deposit amount is public; it becomes one private note.</>,
              <>In <b>Members</b>, paste one person per line as <C>name, email</C> (email optional). Each person gets a private invite link; copy them individually or all at once as CSV.</>,
              <>When people have accepted, open <b>Payroll</b>, enter amounts (or bulk-fill with <C>email or name, amount</C>), set the memo and pay. Up to 15 people are paid per transaction, so N people take ⌈N/15⌉ wallet confirmations.</>,
              <>Use <b>Save as default amounts</b> to prefill the next run, and <b>One-off payment</b> for bonuses or reimbursements.</>,
              <>Every run appears in <b>History</b> with its transactions, a CSV export and a printable receipt. If a run is interrupted, press <b>Resume</b>; nobody is paid twice.</>,
            ]} />
            <Callout title="One note must cover the whole run">
              Each payroll transaction spends a single treasury note, so the note you pay from has to cover the entire run.
              Notes can't be combined yet; if your balance is split across several deposits, deposit the full amount as one note.
              The payroll screen warns before you start.
            </Callout>
          </Sub>

          <Sub id="employees" title="Employees">
            <Steps items={[
              <>Open the invite link your employer sent, connect your wallet and sign in.</>,
              <>Unlock your keys. They are derived from a wallet signature, so the same wallet recovers them on any device.</>,
              <>Accept the invite. This shares only your payment address (an owner tag and an encryption key), never a key that can spend.</>,
              <>Open <Link className="underline underline-offset-4" to="/me">My pay</Link> to see your private balance and each payment. Amounts are decrypted in your browser.</>,
              <>To withdraw, choose a payment and an amount. Whatever you don't withdraw stays private as a new note. For USDC, the VeilPay relayer submits the withdrawal and pays gas, taking a small fee from the payment, so you need no gas and your wallet is not the on-chain sender. The relayer only takes USDC, so EURC withdrawals are sent from your wallet, which needs a little USDC for gas. The withdrawn amount, token and recipient address become public, so consider withdrawing to a fresh address.</>,
              <>To prove a payment to a landlord or bank, use <b>Share proof</b> and send them the link. Use the printer icon for a payslip and <b>Export</b> for a CSV of all payments.</>,
            ]} />
          </Sub>

          <Sub id="verifiers" title="Verifiers">
            <P>
              Open the link you received, or paste it at <Link className="underline underline-offset-4" to="/verify">/verify</Link>.
              No wallet or account is needed. Your browser re-hashes the payment details and checks them against the vault's own
              log on Arc. A <b>Verified payment</b> result means a payment with exactly that amount and memo exists in the vault at
              the stated block. Read <a className="underline underline-offset-4" href="#disclosure">what it does not prove</a> before relying on it.
            </P>
          </Sub>
        </Section>

        <Section id="how" title="How it works" eyebrow="Protocol">
          <Sub id="notes" title="Notes and commitments">
            <P>
              Value inside the vault lives in notes. A note is never stored in the clear: the chain only holds its commitment, a
              Poseidon hash, while the note itself travels encrypted to its owner.
            </P>
            <Pre>{`ownerTag   = Poseidon(spendSecret)
commitment = Poseidon(domainTag, ownerTag, asset, amount, rho)   asset = token address, amount < 2^64 in its ERC-20 units
nullifier  = Poseidon(1, spendSecret, commitment)`}</Pre>
            <P>
              <C>rho</C> is a fresh random field element, so two notes with the same owner and amount still have unrelated
              commitments. Only the holder of <C>spendSecret</C> can compute a note's nullifier, which is what spending reveals.
            </P>
          </Sub>

          <Sub id="circuit" title="The transaction circuit">
            <P>
              Every vault operation (deposit, payroll, withdrawal) is the same circuit: spend one input note, create sixteen output
              notes of the same token, with public deposit, withdrawal and fee amounts.
            </P>
            <Pre>{`input.amount + depositAmount = Σ outputs[0..15].amount + withdrawAmount + fee
input.asset = outputs[i].asset = noteAsset                     one token per transaction
(depositAmount + withdrawAmount + fee) · (asset − noteAsset) = 0
all amounts < 2^64`}</Pre>
            <Bullets items={[
              <>A deposit spends a <em>dummy</em> input with amount 0. A zero-amount input skips the Merkle membership check, which is safe because it carries no value.</>,
              <>Unused outputs are zero-value dummies encrypted to throwaway keys, so every transaction has the same shape. The outputs are shuffled so the position of a real payment doesn't leak.</>,
              <>The public <C>asset</C> must name the notes' token only when value enters or leaves. Payroll transactions move nothing in or out, so they pass zero and the vault rejects anything else: outsiders can't tell which token a payroll moved. A note can't be withdrawn as another token, because its token is inside the commitment.</>,
              <>About 27k constraints; Groth16 on BN254, verified on-chain with Arc's pairing precompiles. Proofs are generated in the browser; on a laptop a whole payroll transaction, including the proof and confirmation, took about 4 seconds.</>,
              <>Public inputs, in order: <C>root, nullifier, outCommitment[16], depositAmount, withdrawAmount, fee, asset, extDataHash, domainTag</C> (24 in total).</>,
            ]} />
          </Sub>

          <Sub id="tree" title="Merkle tree and nullifiers">
            <P>
              Commitments are appended to a depth-20 Poseidon Merkle tree (about one million notes). Each transaction inserts its
              sixteen outputs as one aligned subtree, so the contract computes 31 hashes instead of 320. The vault accepts proofs
              against any of its last 32 roots, so a proof built a few blocks ago still verifies.
            </P>
            <P>
              Spending marks the input's nullifier as used. A second spend of the same note produces the same nullifier and is
              rejected, which is also what makes payroll retries safe.
            </P>
          </Sub>

          <Sub id="binding" title="Binding and replay protection">
            <Bullets items={[
              <><b>External data.</b> The contract hashes the withdrawal recipient, fee recipient and all sixteen ciphertexts into <C>extDataHash</C>, which is a public input. Anyone relaying the transaction cannot change where money goes or swap the ciphertexts without invalidating the proof.</>,
              <><b>Domain tag.</b> <C>domainTag = keccak256("veilpay.v3", chainId, vault) mod r</C>, computed by the vault at deployment. Notes and proofs from another chain or another vault do not verify here.</>,
              <><b>Signed deposits.</b> USDC and EURC deposits are authorized by an EIP-3009 <C>ReceiveWithAuthorization</C> signature whose nonce is <C>depositWitness = hash(VeilPayDeposit(uint256[16] outCommitments, uint256 extDataHash))</C>; the token only accepts it from the vault, and only once. Other tokens use a Permit2 <C>PermitWitnessTransferFrom</C> signature with the same witness. Either way, whoever submits it (the relayer, or anyone who sees it in the mempool) can only create exactly the outputs the depositor signed for.</>,
              <><b>Field checks.</b> The verifier rejects any public input at or above the field modulus, so a commitment can't be aliased by adding the modulus.</>,
            ]} />
          </Sub>

          <Sub id="keys" title="Keys">
            <P>Each user's VeilPay keys come from one 32-byte seed, derived from a wallet signature over a fixed message:</P>
            <Pre>{`seed        = blake2b-256(key = "veilpay.seed.v1", signature)
spendSecret = blake2b-512(key = seed, "veilpay.spend.v1") mod r     spends notes, never shared
viewKeypair = X25519 from blake2b-256(key = seed, "veilpay.view.v1") decrypts notes`}</Pre>
            <Bullets items={[
              <>The message names the chain and the vault, so keys are specific to this deployment.</>,
              <>Signing in (SIWE) and unlocking keys are separate signatures: the sign-in message contains a fresh nonce and so can't produce stable keys, and the key signature must never reach a server.</>,
              <>The first time on a device you sign the key message twice. Some MPC and smart-contract wallets produce a different signature each time; VeilPay refuses them rather than create keys you couldn't recover.</>,
              <>The seed is kept in this tab's session storage and cleared when the tab closes or you disconnect.</>,
            ]} />
            <Callout tone="warn" title="Only sign the key message inside VeilPay">
              Anyone who obtains that signature can derive your spend key. The message says so; a phishing site asking you to sign
              it is trying to take your funds.
            </Callout>
          </Sub>

          <Sub id="encryption" title="Note encryption">
            <P>
              Each output note is encrypted to its owner's view key with libsodium's sealed box (X25519 + XSalsa20-Poly1305) and
              published in the vault's <C>NewCommitment</C> event.
            </P>
            <Table
              head={['Field', 'Bytes']}
              rows={[['version', '2'], ['asset (token address)', '20'], ['amount (big-endian)', '8'], ['rho', '32'], ['memo (UTF-8, zero-padded)', '64'], ['sealed-box overhead', '48'], ['ciphertext total', '173']]}
            />
            <P>
              To build a balance, the browser tries to decrypt every event and keeps a note only if re-hashing it with its own
              owner tag reproduces the on-chain commitment. A ciphertext that decrypts but doesn't match is ignored.
            </P>
          </Sub>

          <Sub id="batch" title="Batch payroll and resume">
            <P>
              A run of N people is split into ⌈N/15⌉ transactions. Each transaction pays fifteen people and returns the rest to the
              employer as a change note whose memo is <C>run:&lt;runId&gt;:&lt;k&gt;</C>; the next transaction spends that change.
            </P>
            <P>
              Progress therefore lives on-chain. To resume, the browser scans the employer's notes for the highest <C>k</C> of the
              run and continues after it. Because each chunk spends a note that can only be spent once, a retry can't pay a
              chunk twice, and two tabs running the same payroll collide on one nullifier instead of double-paying.
            </P>
          </Sub>

          <Sub id="index" title="Event index">
            <P>
              Arc's RPC rejects log queries spanning more than 10,000 blocks, which is roughly 85 minutes of Arc blocks. The
              VeilPay server therefore indexes the vault's public <C>NewCommitment</C> and <C>NewNullifier</C> events. Every
              client downloads all of them and decrypts locally; asking for &ldquo;my notes&rdquo; or checking spends one by
              one would tell the server or RPC which notes are yours.
            </P>
          </Sub>
        </Section>

        <Section id="privacy" title="Privacy model" eyebrow="Data">
          <P>Three places hold VeilPay data. This is the complete list.</P>
          <Table
            head={['Where', 'What', 'Readable by']}
            rows={[
              ['Arc (vault)', 'Note commitments, 173-byte encrypted notes, nullifiers, tree roots', 'Everyone sees them; only each owner can read their notes'],
              ['Arc (vault)', 'Deposit and withdrawal amounts, tokens, depositor and recipient; fees, senders, timing', <b key="p">Public</b>],
              ['Server', 'Organization names, payroll tokens and owner wallets; member names, emails, wallets and payment addresses; invite codes', <span key="s">The VeilPay operator (plaintext today)</span>],
              ['Server', 'Payroll run details and default salaries', 'Only the employer: sealed to their view key in the browser'],
              ['Server', 'Run status, recipient count and timestamps; a cache of public vault events', 'The VeilPay operator'],
              ['Browser', 'Seed and keys, decrypted balances, proofs, verification link contents', 'Only you'],
            ]}
          />
          <Callout tone="warn" title="What VeilPay does not hide">
            <Bullets items={[
              'Deposits and withdrawals are ordinary transfers: amounts, tokens and addresses are public. Payroll transactions hide their token.',
              'The server can match run timestamps to on-chain transactions and so knows which transactions are an organization\'s payroll and in which token, though not the amounts.',
              'Withdrawing to the wallet you registered lets the server, and anyone who knows that wallet, link the withdrawal to you.',
              'Small teams paid at the same time can be inferred from timing and totals; privacy grows with the number of users.',
              'Encrypted notes stay on-chain forever. If a view key leaks later, that person\'s past payments become readable.',
            ]} />
          </Callout>
        </Section>

        <Section id="disclosure" title="Verification links" eyebrow="Selective disclosure">
          <P>
            <b>Share proof</b> builds a link containing one note's opening: index, block, commitment, owner tag, token, amount, rho
            and memo. It sits after <C>#</C> in the URL, which browsers never send to a server, so neither VeilPay nor any host sees
            it. Nothing is written on-chain.
          </P>
          <Steps items={[
            `Checks that the link is for this vault on ${arc.name}.`,
            <>Re-hashes the opening with the vault's domain tag and compares it with the stated commitment.</>,
            <>Queries Arc directly (not the VeilPay API) for the vault's <C>NewCommitment</C> log at that block and note index.</>,
          ]} />
          <Table
            head={['Proves', 'Does not prove']}
            rows={[
              ['A note with exactly this token, amount and memo was created in the vault at that block', 'Who paid it; confirm the employer separately'],
              ['The token and amount have not been edited (changing either breaks the hash)', 'That the presenter is the recipient; the payer also knows the opening'],
              ['The note belongs to this deployment, not another chain or vault', 'That it is still unspent; only the owner\'s key can show that'],
            ]}
          />
          <P>Proofs bound to the issuing employer, and zero-knowledge &ldquo;paid at least X&rdquo; proofs, are planned for protocol v2.</P>
        </Section>

        <Section id="contracts" title="Contracts and network" eyebrow="Deployment">
          <Table
            head={['Item', 'Value']}
            rows={[
              ['Network', `${arc.name}, chain id ${arc.id}`],
              ['RPC', <span key="r" className="num">{arc.rpcUrls.default.http[0]}</span>],
              ['Explorer', <Ext key="e" href={EXPLORER}>{EXPLORER.replace('https://', '')}</Ext>],
              ['VeilPayVault', addr(VAULT)],
              ['TransactionVerifier (Groth16)', addr(VERIFIER)],
              ['Poseidon(2) hasher', addr(POSEIDON)],
              ['USDC (ERC-20 interface)', addr(USDC.address)],
              ['EURC', addr(EURC.address)],
              ['Permit2', addr(PERMIT2)],
              ['Vault deployment block', <span key="b" className="num">{VAULT_DEPLOY_BLOCK.toLocaleString('en-US')}</span>],
            ]}
          />
          <Bullets items={[
            'The vault has no upgrade path, no selfdestruct and no delegatecall. Funds leave only through a verified proof. It has no owner: anyone can register an ERC-20 with 6 to 30 decimals, and a registered token can never be removed, so existing notes always stay withdrawable. Notes count in 6-decimal units; an 18-decimal token moves amount × 10¹² of its own units. Deposits must arrive in full, so fee-on-transfer tokens are rejected; rebasing tokens are not supported.',
            'State changes happen before transfers; any failed token transfer reverts the whole transaction, including the nullifier.',
            'Deposits check the vault\'s balance actually increased by the deposit amount. Tokens sent to the vault directly are not credited to anyone.',
            'Measured on Arc Testnet: 1,616,243 gas for a payroll transaction, 1,743,610 for a relayed EIP-3009 deposit and 1,666,922 for a relayed withdrawal. Most of it is the 31 on-chain Poseidon hashes (about 29k gas each); the rest is Groth16 verification over 24 public inputs, storage and 17 events. A full transaction pays 15 people, so about 108k gas per person.',
          ]} />
          <Callout title="Arc specifics">
            Arc's native USDC (18 decimals) and its ERC-20 interface (6 decimals) are one balance. VeilPay uses the 6-decimal
            ERC-20 interface for every amount. USDC transfers call an Arc-specific precompile, so they only run on Arc itself and
            not on a generic local fork.
          </Callout>
        </Section>

        <Section id="api" title="API reference" eyebrow="Server">
          <P>
            All endpoints are JSON under <C>/api</C>. Authenticated endpoints use the session cookie set by sign-in (7 days);
            organization endpoints also require that you own the organization.
          </P>
          <Table
            head={['Endpoint', 'Auth', 'Purpose']}
            rows={[
              [<C key="1">GET /auth/nonce</C>, '—', 'One-time SIWE nonce (10 minutes)'],
              [<C key="2">POST /auth/verify</C>, '—', 'Verify a SIWE message and signature; sets the session cookie'],
              [<C key="3">POST /auth/logout</C>, '—', 'Clear the session'],
              [<C key="4">GET /me</C>, 'optional', 'Your address, organizations you own, organizations that pay you'],
              [<C key="5">POST /orgs</C>, 'session', 'Create an organization with the owner\'s payment address'],
              [<C key="6">GET /orgs/:id</C>, 'owner', 'Organization, members and the sealed salary book'],
              [<C key="7">POST /orgs/:id/members</C>, 'owner', 'Add up to 500 members; returns invite codes'],
              [<C key="8">DELETE /orgs/:id/members/:memberId</C>, 'owner', 'Remove a member'],
              [<C key="9">PUT /orgs/:id/salary-book</C>, 'owner', 'Store default amounts (ciphertext only)'],
              [<C key="10">GET · POST /orgs/:id/runs</C>, 'owner', 'List or create payroll runs (sealed records)'],
              [<C key="11">PATCH /orgs/:id/runs/:runId</C>, 'owner', 'Update a run\'s status and sealed record'],
              [<C key="12">GET /invites/:code</C>, '—', 'Organization and member name for an invite'],
              [<C key="13">POST /invites/:code/accept</C>, 'session', 'Register your payment address for the invite'],
              [<C key="14">GET /events</C>, '—', 'Public vault events after a cursor (afterIndex, afterBlock)'],
              [<C key="15">GET /stats</C>, '—', 'Note and nullifier counts, last indexed block'],
            ]}
          />
        </Section>

        <Section id="security" title="Security and limits" eyebrow="Read before use">
          <Bullets items={[
            <><b>Trusted setup.</b> The Groth16 parameters come from one local contributor plus a random beacon. Whoever generated them could forge proofs. Production needs a multi-party ceremony.</>,
            <><b>No audit.</b> Circuit, contracts and client have tests (Foundry tests with real proofs, golden vectors shared by browser and Node, end-to-end runs on Arc Testnet) but no independent review.</>,
            <><b>Signature-derived keys.</b> Convenient recovery, at the cost that a signed key message is as good as the keys. Only sign it on VeilPay.</>,
            <><b>Single-note spending.</b> Each transaction spends one note; notes can't be merged yet, which limits how a treasury can be split across deposits.</>,
            <><b>Server trust.</b> The server can't move funds or read amounts, but it sees the roster and serves the event cache. A tampered cache makes proofs fail the vault's on-chain root check, so funds can't be misdirected; a withheld event would hide a note until the cache serves it.</>,
          ]} />
        </Section>

        <Section id="faq" title="FAQ">
          <Sub id="faq-sign" title="Why do I sign so often?">
            <P>One signature signs you in for seven days. A second one derives your keys; the first time on a device it is asked twice to check your wallet is deterministic, and after that once per browser tab. Deposits, payroll and withdrawals are transactions and each needs a confirmation.</P>
          </Sub>
          <Sub id="faq-contract" title="Why aren't payroll records stored in the contract?">
            <P>Each person's payment already is on-chain, as their encrypted note. The employer's copy of a run is a convenience record that changes as a run progresses; storing it in the contract would cost a transaction per update and could never be deleted. Encrypted on-chain payroll receipts are planned for protocol v2 so employers can recover history from their wallet alone.</P>
          </Sub>
          <Sub id="faq-lost" title="What if I lose my wallet?">
            <P>Your VeilPay keys are derived from your wallet, so whoever controls the wallet controls the keys. Losing the wallet means losing access to unspent notes. Back up your wallet as you normally would.</P>
          </Sub>
          <Sub id="faq-employer" title="Can my employer see my balance or my withdrawals?">
            <P>Your employer knows what they paid you. They can't see whether you have withdrawn or what you kept, because spending needs your key. A withdrawal itself is public on-chain, like any transfer.</P>
          </Sub>
          <Sub id="faq-arc" title="What happens when Arc ships native privacy?">
            <P>Arc has announced opt-in privacy (the Arc Privacy Sector), which is not live yet. The plan is to move confidential balances and payroll onto it while keeping organizations, invites, runs and verification links the same. See the <a className="underline underline-offset-4" href="/#roadmap">roadmap</a> and <Ext href="https://docs.arc.io/arc/concepts/opt-in-privacy">Arc's docs</Ext>.</P>
          </Sub>
        </Section>
      </article>
    </div>
  )
}
