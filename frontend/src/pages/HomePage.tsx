import { Link } from 'react-router-dom'
import { Lock, Eye, Zap, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion } from 'motion/react'
import { CryptoOrbit } from '@/components/CryptoOrbit'

const ease = [0.16, 1, 0.3, 1] as const satisfies readonly [number, number, number, number]

function FadeUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease }}
    >
      {children}
    </motion.div>
  )
}

export function HomePage() {
  return (
    <div className="space-y-24 py-8">
      {/* Hero — left-aligned, asymmetric */}
      <section className="grid gap-12 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          <FadeUp>
            <p className="text-sm font-medium text-primary tracking-wide uppercase">
              Powered by FHE Protocol
            </p>
          </FadeUp>
          <FadeUp delay={0.08}>
            <h1 className="text-4xl font-bold tracking-tight text-foreground text-balance sm:text-5xl">
              VeilPay
            </h1>
          </FadeUp>
          <FadeUp delay={0.14}>
            <p className="text-2xl font-semibold text-muted-foreground text-balance">
              Pay your team onchain. Keep salaries private.
            </p>
          </FadeUp>
          <FadeUp delay={0.2}>
            <p className="max-w-lg text-lg text-muted-foreground text-pretty leading-relaxed">
              Fully homomorphic encryption ensures individual salary amounts are never exposed on the blockchain. Only authorized parties can decrypt.
            </p>
          </FadeUp>
          <FadeUp delay={0.28}>
            <div className="flex gap-3 pt-2">
              <Link to="/employer">
                <Button size="lg" className="gap-2">
                  Employer Portal
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link to="/employee">
                <Button size="lg" variant="outline" className="gap-2">
                  Employee Portal
                </Button>
              </Link>
            </div>
          </FadeUp>
        </div>
        <motion.div
          className="hidden lg:flex lg:col-span-2 items-center justify-center relative"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.15, ease }}
        >
          <div className="relative size-96 overflow-hidden">
            <CryptoOrbit />
            <div className="absolute inset-0 flex items-center justify-center">
              <img src="/favicon.png" alt="VeilPay" className="size-36" />
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features — flat, no nested cards */}
      <section className="space-y-8">
        <FadeUp>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            How it protects your data
          </h2>
        </FadeUp>
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            {
              icon: Lock,
              title: 'Encrypted salaries',
              desc: 'Salary amounts are encrypted client-side using FHE before touching the blockchain. On-chain observers see only ciphertext.',
            },
            {
              icon: Eye,
              title: 'Selective disclosure',
              desc: 'Access control grants decryption rights only to the employer and the individual employee. No one else can read the values.',
            },
            {
              icon: Zap,
              title: 'Batch payroll',
              desc: 'Execute payroll for all employees in one transaction. Encrypted amounts flow through ERC-7984 confidential transfers.',
            },
          ].map(({ icon: Icon, title, desc }, i) => (
            <motion.div
              key={title}
              className="space-y-3"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: i * 0.1, ease }}
            >
              <Icon className="size-5 text-primary" />
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground text-pretty leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Process — numbered steps */}
      <section className="space-y-8">
        <FadeUp>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            The process
          </h2>
        </FadeUp>
        <div className="grid gap-px sm:grid-cols-4 bg-border rounded-lg overflow-hidden">
          {[
            { step: '01', title: 'Set salaries', desc: 'Encrypt salary amounts client-side before sending to the contract' },
            { step: '02', title: 'Grant access', desc: 'Smart contract assigns decryption rights to employer and employee' },
            { step: '03', title: 'Execute payroll', desc: 'Confidential ERC-7984 transfers — amounts stay encrypted on-chain' },
            { step: '04', title: 'Verify payment', desc: 'Employees decrypt their own balance to confirm receipt' },
          ].map(({ step, title, desc }, i) => (
            <motion.div
              key={step}
              className="bg-card p-6 space-y-3"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-20px' }}
              transition={{ duration: 0.45, delay: i * 0.08, ease }}
            >
              <span className="text-xs font-semibold text-primary tabular-nums">{step}</span>
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground text-pretty leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  )
}
