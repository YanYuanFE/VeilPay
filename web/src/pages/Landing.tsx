import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { Logo, LogoMark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { VeilCanvas } from '@/components/VeilCanvas'
import { api } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { short } from '@/lib/format'
import { EXPLORER, VAULT } from '@/lib/veilpay/config'

type Stats = { notes: number; spent: number; lastBlock: string | null }

const rise = (delay: number): CSSProperties => ({ animationDelay: `${delay}ms` })

function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex h-20 max-w-7xl items-center gap-10 px-6 md:px-10">
        <Link to="/"><Logo /></Link>
        <nav className="hidden gap-8 text-sm text-muted-foreground lg:flex">
          <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#roadmap" className="transition-colors hover:text-foreground">Roadmap</a>
          <Link to="/docs" className="transition-colors hover:text-foreground">Docs</Link>
          <Link to="/verify" className="transition-colors hover:text-foreground">Verify a payment</Link>
        </nav>
        <ThemeToggle className="ml-auto hidden sm:inline-flex" />
        <Link to="/app" className="group ml-auto inline-flex sm:ml-3 items-center gap-2 rounded-full border border-hairline bg-ink/40 px-4 py-2 text-sm backdrop-blur-md transition-colors hover:border-bone/40">
          Launch app <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </header>
  )
}

function Hero({ stats }: { stats: Stats | null }) {
  const { theme } = useTheme()
  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      <VeilCanvas theme={theme} className="absolute inset-0 -z-10 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(0deg,var(--ink)_8%,color-mix(in_oklch,var(--ink)_75%,transparent)_45%,transparent_75%)] md:bg-[linear-gradient(90deg,var(--ink)_0%,color-mix(in_oklch,var(--ink)_55%,transparent)_38%,transparent_70%)]" />

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-6 pb-14 pt-32 md:px-10 md:pb-20">
        <p className="eyebrow animate-rise" style={rise(100)}>Private payroll · USDC &amp; EURC on Arc</p>
        <h1 className="mt-6 max-w-4xl text-[clamp(3.6rem,10vw,9.5rem)] leading-[0.92] font-medium">
          <span className="block animate-rise" style={rise(180)}>Payroll,</span>
          <span className="block animate-rise italic text-seal" style={rise(320)}>sealed.</span>
        </h1>
        <div className="mt-10 grid max-w-5xl gap-10 md:grid-cols-[1.2fr_1fr] md:items-end">
          <p className="animate-rise text-lg leading-relaxed text-bone/80 md:text-xl" style={rise(520)}>
            Pay your whole team in USDC or EURC from one treasury. The chain verifies that every cent adds up,
            and learns none of the salaries. Each employee opens only their own envelope.
          </p>
          <div className="flex animate-rise flex-wrap gap-3" style={rise(640)}>
            <Link to="/app" className="group inline-flex items-center gap-2 rounded-full bg-bone px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-seal">
              Run a private payroll <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a href="#how" className="inline-flex items-center rounded-full border border-hairline px-6 py-3 text-sm transition-colors hover:border-bone/40">
              See how it works
            </a>
            <p className="mt-2 flex w-full items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block size-2.5 rounded-full ring-1 ring-seal" aria-hidden="true" />
              <span className="hidden md:inline">Move your cursor over the ledger.</span>
              <span className="md:hidden">Drag across the ledger.</span> The lens is your key.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-hairline bg-ink/55 backdrop-blur-md">
        <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-y-4 px-6 py-5 md:grid-cols-4 md:px-10">
          {[
            ['Vault', <a key="v" className="hover:text-seal" href={`${EXPLORER}/address/${VAULT}`} target="_blank" rel="noreferrer">{short(VAULT, 8, 6)}</a>],
            ['Notes sealed', stats ? stats.notes.toLocaleString('en-US') : '—'],
            ['Notes spent', stats ? stats.spent.toLocaleString('en-US') : '—'],
            ['Indexed block', stats?.lastBlock ? Number(stats.lastBlock).toLocaleString('en-US') : '—'],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="eyebrow">{label}</dt>
              <dd className="num mt-1 text-sm text-bone">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function ChainVsYou() {
  return (
    <section id="ledger" className="mx-auto max-w-7xl scroll-mt-10 px-6 py-28 md:px-10 md:py-36">
      <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
        <p className="eyebrow">01 — One payment, two readers</p>
        <h2 className="text-4xl leading-[1.05] md:text-6xl">
          The block explorer gets a hash. <em className="text-seal">She</em> gets her salary.
        </h2>
      </div>

      <div className="relative mt-16 grid gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:grid-cols-2">
        <div className="bg-ink p-8 md:p-10">
          <p className="eyebrow">Public ledger · anyone</p>
          <dl className="num mt-8 space-y-5 text-sm">
            {[
              ['event', 'NewCommitment'],
              ['commitment', '0x1c3e7a90…f4d2'],
              ['index', '17'],
              ['ciphertext', '153 bytes · 0x8f02c1…be7a'],
              ['nullifier', 'not yet spent'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6 border-b border-hairline pb-3">
                <dt className="text-muted-foreground">{k}</dt><dd className="text-right text-bone/80">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-6 pt-1">
              <dt className="text-muted-foreground">amount</dt>
              <dd className="tracking-[0.4em] text-bone/30">••••••</dd>
            </div>
          </dl>
        </div>
        <div className="relative bg-card p-8 md:p-10">
          <p className="eyebrow">Her browser · her key</p>
          <div className="mt-8">
            <p className="text-sm text-muted-foreground">2026-10 salary · Acme Labs</p>
            <p className="num mt-3 text-5xl text-bone md:text-6xl">3,000.00</p>
            <p className="num mt-1 text-sm text-muted-foreground">USDC · available to withdraw</p>
          </div>
          <p className="mt-10 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Decrypted locally with a key derived from her wallet signature, then re-hashed and matched
            to the on-chain commitment before it counts.
          </p>
        </div>
        <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink p-2 ring-1 ring-hairline md:block">
          <LogoMark className="size-10" />
        </div>
      </div>
    </section>
  )
}

const LAYERS = [
  { n: '01', title: 'Deposit', body: 'The treasury moves USDC or EURC into the vault once. That amount is public.', tone: 'bg-bone/[0.07]' },
  { n: '02', title: 'Seal & split', body: 'A zero-knowledge proof splits one note into salaries. Totals must balance; amounts stay sealed.', tone: 'bg-seal/25' },
  { n: '03', title: 'Withdraw', body: 'Each employee proves ownership of their note and withdraws whenever they choose.', tone: 'bg-bone/[0.12]' },
]

function HowItWorks() {
  return (
    <section id="how" className="relative scroll-mt-10 border-y border-hairline bg-card/40">
      <div className="mx-auto grid max-w-7xl gap-16 px-6 py-28 md:grid-cols-2 md:px-10 md:py-36">
        <div>
          <p className="eyebrow">02 — How it works</p>
          <h2 className="mt-6 text-4xl leading-[1.05] md:text-6xl">Three layers.<br /><em>One envelope each.</em></h2>
          <ol className="mt-12 space-y-8">
            {LAYERS.map((l) => (
              <li key={l.n} className="grid grid-cols-[3rem_1fr] gap-4">
                <span className="num pt-1 text-sm text-seal">{l.n}</span>
                <div>
                  <h3 className="font-sans text-lg font-medium">{l.title}</h3>
                  <p className="mt-1 leading-relaxed text-muted-foreground">{l.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* CSS 3D: stacked translucent sheets; they part on hover */}
        <div className="group relative flex min-h-[26rem] items-center justify-center [perspective:1400px]">
          <div className="relative h-64 w-64 [transform-style:preserve-3d] [transform:rotateX(58deg)_rotateZ(-36deg)] md:h-80 md:w-80">
            {LAYERS.map((l, i) => (
              <div
                key={l.n}
                className={`absolute inset-0 rounded-lg border border-bone/20 ${l.tone} shadow-[0_30px_60px_-20px_var(--sheet-shadow)] backdrop-blur-[2px] transition-transform duration-700 ease-[cubic-bezier(0.2,0.7,0.1,1)] [transform:translateZ(var(--z0))] group-hover:[transform:translateZ(var(--z1))]`}
                style={{ '--z0': `${i * 46}px`, '--z1': `${i * 92}px` } as CSSProperties}
              >
                <div className="flex h-full flex-col justify-between p-5 [transform:translateZ(1px)]">
                  <span className="num text-xs text-bone/70">{l.n}</span>
                  <span className="font-display text-3xl italic text-bone/90">{l.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

const GUARANTEES = [
  ['Conservation', 'Every transaction proves inputs equal outputs plus withdrawals and fees. Nobody can mint a cent.'],
  ['Spend once', 'Each note has a nullifier. The vault rejects the second spend, so a retried payroll never pays twice.'],
  ['Keys stay home', 'Spend and view keys are derived in the browser from a wallet signature and never reach a server.'],
  ['Server sees ciphertext', 'Payroll records are sealed to the employer’s own key before they are stored.'],
]

function Guarantees() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-28 md:px-10 md:py-36">
      <p className="eyebrow">03 — What is enforced</p>
      <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
        {GUARANTEES.map(([title, body], i) => (
          <div key={title} className="group bg-ink p-8 transition-colors hover:bg-card">
            <span className="font-display text-6xl italic text-bone/20 transition-colors group-hover:text-seal">{i + 1}</span>
            <h3 className="mt-6 font-sans text-lg font-medium">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Limits() {
  return (
    <section id="limits" className="scroll-mt-10 border-t border-hairline">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-28 md:grid-cols-[1fr_1.4fr] md:px-10 md:py-36">
        <div>
          <p className="eyebrow">04 — Honest limits</p>
          <h2 className="mt-6 text-4xl leading-[1.05] md:text-5xl">What the veil <em className="text-seal">doesn’t</em> cover.</h2>
        </div>
        <ul className="divide-y divide-hairline border-y border-hairline">
          {[
            'Deposits and withdrawals are ordinary public transfers: their amounts and addresses are visible.',
            'A small team paid at the same time can be guessed from timing and totals. Privacy grows with the pool.',
            'Your keys come from a wallet signature. A phishing site that gets the same message signed gets the keys.',
            'Testnet prototype: single-party trusted setup, contracts and circuit not yet audited.',
          ].map((t) => (
            <li key={t} className="flex gap-4 py-5 text-bone/85">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-seal" />
              <span className="leading-relaxed">{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

const PHASES: { tag: string; title: string; status: 'live' | 'next' | 'later'; items: string[] }[] = [
  {
    tag: 'Now', title: 'Private payroll on Arc Testnet', status: 'live',
    items: [
      'ZK vault with Groth16 proofs verified on-chain',
      'Notes sealed to each employee; balances decrypted in the browser',
      'USDC or EURC per organization; payroll transactions don’t reveal which token moved',
      'No gas for users: a relayer submits USDC transactions, and a deposit is one EIP-3009 signature with no approval',
      'Organizations, CSV roster import, 15 people per payroll transaction with safe resume',
      'Private verification links for landlords, banks and auditors',
    ],
  },
  {
    tag: 'Next', title: 'Protocol v2', status: 'next',
    items: [
      'Issuer-bound income proofs: prove “paid ≥ X by this employer” without the amount',
      'Encrypted payroll receipts on-chain, so employers recover history from their wallet alone',
      'Multi-party trusted setup and an independent audit',
    ],
  },
  {
    tag: 'Then', title: 'Mainnet', status: 'next',
    items: [
      'Roster names and emails encrypted per person, with crypto-shredding on removal',
      'Fund payroll with USDC from any chain through Circle Gateway; withdraw to other chains through CCTP',
      'Launch with USDC on Arc mainnet',
    ],
  },
  {
    tag: 'Agents', title: 'For AI agents', status: 'next',
    items: [
      'Pay AI agents privately: read a VeilPay payment address from an agent’s ERC-8004 identity, no invite needed',
      'Read-only accounting agents: share a view key so an agent can do bookkeeping and reconciliation but never spend',
    ],
  },
  {
    tag: 'With Arc', title: 'Migrate to Arc’s native privacy', status: 'later',
    items: [
      'Arc has announced opt-in privacy (the Arc Privacy Sector); it is not live yet',
      'When it ships, move confidential balances and payroll onto it',
      'Keep organizations, invites, payroll runs and verification links unchanged for users',
      'Retire the custom vault once funds have moved',
    ],
  },
]

function Roadmap() {
  return (
    <section id="roadmap" className="scroll-mt-10 border-t border-hairline bg-card/40">
      <div className="mx-auto max-w-7xl px-6 py-28 md:px-10 md:py-36">
        <div className="grid gap-6 md:grid-cols-[1fr_2fr] md:items-end">
          <div>
            <p className="eyebrow">05 — Roadmap</p>
            <h2 className="mt-6 text-4xl leading-[1.05] md:text-5xl">From our own vault <em className="text-seal">to Arc’s</em>.</h2>
          </div>
          <p className="max-w-xl leading-relaxed text-muted-foreground md:justify-self-end">
            VeilPay brings private payroll to Arc today with its own zero-knowledge vault. When Arc’s native privacy arrives,
            the product moves onto it and the vault steps aside.
          </p>
        </div>

        <ol className="relative mt-16 grid gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:grid-cols-2 lg:grid-cols-5">
          {PHASES.map((p) => (
            <li key={p.tag} className={`relative flex flex-col bg-ink p-7 md:last:col-span-2 lg:last:col-span-1 ${p.status === 'later' ? 'md:bg-card' : ''}`}>
              <div className="flex h-6 items-center gap-3">
                <span
                  className={`size-2.5 rounded-full ${p.status === 'live' ? 'bg-seal shadow-[0_0_0_4px_color-mix(in_oklch,var(--seal)_22%,transparent)]' : p.status === 'next' ? 'ring-1 ring-bone/50' : 'ring-1 ring-seal'}`}
                  aria-hidden="true"
                />
                <span className="eyebrow">{p.tag}</span>
                {p.status === 'live' && <span className="num ml-auto rounded-full border border-seal/40 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.14em] text-seal">Live</span>}
              </div>
              <h3 className="mt-6 text-2xl leading-tight">{p.title}</h3>
              <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {p.items.map((i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-2 h-px w-3 shrink-0 bg-bone/30" aria-hidden="true" />
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
              {p.status === 'later' && (
                <a href="https://docs.arc.io/arc/concepts/opt-in-privacy" target="_blank" rel="noreferrer"
                  className="mt-auto inline-flex items-center gap-1 pt-8 text-sm text-bone/80 transition-colors hover:text-seal">
                  Arc opt-in privacy docs <ArrowUpRight className="size-3.5" />
                </a>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-6 text-xs text-muted-foreground">Order reflects intent, not dates. The final step depends on Arc’s design and timeline.</p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto max-w-7xl px-6 py-24 md:px-10">
        <h2 className="max-w-3xl text-5xl leading-[0.95] md:text-7xl">Seal your next payroll.</h2>
        <Link to="/app" className="group mt-10 inline-flex items-center gap-2 rounded-full bg-seal px-7 py-3.5 font-medium text-ink transition-colors hover:bg-bone">
          Launch VeilPay <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <div className="rule mt-24" />
        <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <Logo />
          <a className="num inline-flex items-center gap-1 hover:text-bone" href={`${EXPLORER}/address/${VAULT}`} target="_blank" rel="noreferrer">
            VeilPayVault {short(VAULT, 8, 6)} on Arc Testnet <ArrowUpRight className="size-3.5" />
          </a>
          <span className="flex gap-5">
            <Link to="/docs" className="hover:text-bone">Docs</Link>
            <Link to="/verify" className="hover:text-bone">Verify a payment</Link>
            <span>Testnet prototype · not audited</span>
          </span>
        </div>
      </div>
    </footer>
  )
}

export function Landing() {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => {
    // decorative counters; the page reads fine without them
    api<Stats>('/stats').then(setStats, (err) => console.error('stats unavailable', err))
  }, [])
  return (
    <div className="min-h-svh bg-background text-foreground">
      <Header />
      <Hero stats={stats} />
      <ChainVsYou />
      <HowItWorks />
      <Guarantees />
      <Limits />
      <Roadmap />
      <Footer />
    </div>
  )
}
