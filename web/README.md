# VeilPay Web

Private USDC payroll on Arc Testnet: organizations, bulk invites, bulk payroll, and employee withdrawals.
User and protocol documentation lives in the app at `/docs` (`src/pages/Docs.tsx`).
Vite + React + shadcn/ui frontend with RainbowKit (wagmi 2) wallet connection, one Vercel Function (`api/index.ts`) backed by Postgres (Neon in production).

## What lives where

| Data | Location |
| --- | --- |
| Spend secret, view key, seed | Browser only (derived from a wallet signature, cached in `sessionStorage`) |
| Proof generation | Browser (`snarkjs`, artifacts in `public/zk/v1/`) |
| Orgs, member names/emails, invite codes, payment addresses (`ownerTag`, `viewPub`) | Postgres |
| Payroll run details (who got how much) | Postgres, **sealed to the employer's view key in the browser**; the server sees ciphertext |
| Commitments, ciphertexts, nullifiers | Public chain; cached by `/api/events` (Arc RPC caps `eth_getLogs` at 10k blocks) |

Clients download all events and decrypt locally, so neither the server nor the RPC learns which notes are whose.

## Batch payroll

The circuit is 1 input → 16 outputs, so a run pays 15 people per transaction and spends the previous change note.
Each change note carries the memo `run:<runId>:<k>`; on resume the browser scans its own notes for the highest `k`
and continues after it. A chunk's input note can only be spent once, so a retry cannot pay anyone twice.

## Proving a payment to a third party

An employee can share one payment with a landlord, bank or auditor from **My pay → Share proof**. The link carries
the note opening in its URL fragment (`/verify#d=…`), which browsers never send to a server. `/verify` re-hashes the
opening with the vault's domain tag and checks the commitment against the vault's own `NewCommitment` log by
querying Arc directly, so the verifier does not need to trust VeilPay. Nothing is published on-chain.

It proves a note with that amount and memo exists in the vault at that block. It does not prove who paid it, that the
presenter is the recipient (the payer also knows the opening), or that it is still unspent. Issuer-bound proofs need a
protocol change (an issuer field in the commitment) and are on the roadmap.

## Exports

Payroll runs (per run or all), and an employee's payments, export as CSV whose last line is
`# veilpay-export k=v · … · sha256=<hex>`; the hash covers every line above it. Payslips and payroll receipts open as
print-ready pages (save as PDF from the print dialog). Everything is generated in the browser from decrypted data.
Default salary amounts are sealed to the employer's view key before upload, like payroll records.

## Themes

A cool "security paper" palette (blue-black ink, mint-grey paper, one vermilion seal) in dark and light; both share one set of tokens: light mode swaps the values of `--ink` and `--bone`
(`src/index.css`), so `bg-ink` / `text-bone` keep their roles. The header toggle offers System / Light / Dark; the choice
is stored in `localStorage` (`vp_theme`) and applied by an inline script in `index.html` before first paint. The hero's
WebGL veil takes a matching palette (`VeilCanvas` `PALETTES`).

## Develop

```bash
docker run -d --name veilpay-pg -e POSTGRES_PASSWORD=veilpay -e POSTGRES_DB=veilpay -p 55432:5432 postgres:17-alpine
printf 'DATABASE_URL=postgres://postgres:veilpay@localhost:55432/veilpay\nSESSION_SECRET=%s\n' "$(openssl rand -hex 32)" > .env.local
npm install
npx vite --port 5190      # /api/* is served by the same handler via a Vite dev plugin
npx vitest run            # golden vectors: browser crypto must match prover/*.mjs byte for byte
```

`scripts/dev-wallet.mjs` is a dev-only EIP-1193 signer for browser E2E tests without a wallet extension
(`PRIVATE_KEY=0x.. node scripts/dev-wallet.mjs`); never run it against keys holding real funds.

## Deploy (Vercel)

Project root directory: `web`. Required env vars: `DATABASE_URL` (Neon, pooled connection string) and
`SESSION_SECRET` (32+ random bytes, hex). The schema is created on the first API request.

`VITE_WALLETCONNECT_PROJECT_ID` (from cloud.reown.com) enables RainbowKit's full wallet list including
WalletConnect / mobile wallets. Without it only browser-extension wallets are offered and a console warning says so.
Sign-in (SIWE) runs inside the RainbowKit connect modal; disconnecting signs out and clears the cached keys.

## Limits

- Testnet only: single-party Groth16 setup, contracts and circuit not audited.
- Seeds come from wallet signatures: a phishing site that gets the same message signed obtains the keys.
- Deposits and withdrawals are public; amounts inside the vault are not.
