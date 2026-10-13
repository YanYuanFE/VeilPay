# VeilPay

VeilPay is a private payroll project for Arc. It hides employee salary allocations and balances inside a multi-asset pool (USDC and EURC on Arc) while keeping fund conservation and redemption verifiable.

Status: G0 verification is done. The transaction circuit and vault contract are deployed on Arc testnet, and deposits, private payroll, withdrawals, and double-spend rejection all work on-chain. Note encryption and employee-side scanning/decryption are done and verified on testnet. `web/` is a standalone frontend + backend project that supports creating organizations, bulk-inviting members, batch payroll, and employee withdrawals. It has been verified end to end locally against Arc testnet but is not yet deployed to Vercel. Each organization picks its payroll token (USDC or EURC) at creation. Deposits are authorized by a single signature: EIP-3009 `receiveWithAuthorization` for USDC and EURC (no approval transaction at all), Permit2 for other tokens. USDC deposits and withdrawals go through a relayer endpoint in the same backend, so users need no gas and are not the on-chain sender; EURC transactions are sent from the user's wallet because the relayer only takes USDC fees.

## Code layout

- `web/`: Vite + React + shadcn/ui frontend, with a Vercel Function + Postgres backend. Proofs are generated in the browser; the backend only stores organizations, member lists, payout addresses, and payroll records sealed with the employer's viewing key. See [web/README.md](web/README.md).
- `circuits/transaction.circom`: unified transaction circuit. 1 input note and 16 output notes (up to 15 payees per transaction plus 1 change note), with public deposit, withdrawal, and fee amounts; deposits use a zero-value dummy input note. Every note commits to its token; one transaction moves one token, which is public only when value enters or leaves, so payroll transactions hide it. About 26.9k constraints, 24 public inputs.
- `contracts/src/VeilPayVault.sol`: non-upgradeable multi-asset vault. Depth-20 Poseidon commitment tree (each transaction inserts a 16-leaf subtree), 32 historical roots, a nullifier set, an `extDataHash` binding the recipient, fee recipient, and ciphertexts, an add-only token allowlist, `transactWithAuthorization` for EIP-3009 deposits, and `transactWithPermit2` for Permit2 deposits. Both bind the signature to `depositWitness(outCommitments, extDataHash)` (the EIP-3009 nonce or the Permit2 witness), so a submitter cannot redirect the funds.
- `contracts/src/TransactionVerifier.sol`: Groth16 verifier exported by `scripts/build_circuit.sh`.
- `prover/prove.mjs`: generates transaction proofs locally and rebuilds Merkle paths.
- `contracts/test/VeilPayVault.t.sol`: 25 tests that call the real prover via ffi. Covers deposits, private payroll, relayed withdrawals, double spends, tampered recipient/fee/ciphertext/amount, cross-vault replay, unknown roots, atomic rollback for blocklisted addresses, unauthorized deposits, inflation, and spending someone else's note; plus separate per-token ledgers, withdrawing a note as another token, unlisted tokens, hidden payroll tokens, the add-only allowlist, Permit2 deposits (relayed, front-run with a stolen signature, no deposit), and EIP-3009 deposits (no approval, stolen signature, single-use authorization, no deposit) against a mock with FiatToken's checks. Permit2 runs from its Arc testnet bytecode (`test/fixtures/permit2.hex`).
- `contracts/script/Deploy.s.sol`: deploys the Poseidon hasher, verifier, and vault.
- `prover/wallet.mjs`: wallet. Derives the spending secret and X25519 viewing key from a 32-byte seed; encrypts notes with libsodium sealed boxes (fixed 173-byte ciphertext that includes the token); scans on-chain events, decrypts, and checks commitments. `prover/wallet.test.mjs` has 9 tests (`node --test prover/*.test.mjs`).
- `prover/testnet_flow.mjs`: drives the full testnet flow with cast; rebuilds the commitment tree from `NewCommitment` events, with USDC transfers executed for real on an Arc node.

## Build and test

```bash
npm ci
./scripts/build_circuit.sh          # compile circuit, single-party local setup, export verifier
(cd contracts && forge test)
```

## Deploy to Arc testnet

Put `PRIVATE_KEY=0x...` in `contracts/.env` (forge needs the `0x` prefix) (use a testnet-only account with at least ~1 USDC plus gas):

```bash
cd contracts && forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.io --broadcast && cd ..
PRIVATE_KEY=0x... node prover/testnet_flow.mjs <vault> <deployBlock> research/<report>.json
```

`forge script` simulates on a local EVM first and cannot execute the precompile Arc USDC relies on, so the USDC flow sends transactions directly with cast.

### Current testnet deployment (v4, EIP-3009 deposits, 2026-10-13)

| Contract | Address |
| --- | --- |
| VeilPayVault | `0x4eAC336a5d9ed20125180368888bfcc07DB1D2b3` (block 66924551) |
| TransactionVerifier | `0x231a8Ab940cdf3d941b23f41f39F11dD579be31E` |
| Poseidon(2) | `0x05357D9598ff47DEA70B04d4C585AF5BC592F344` |

Same circuit, proving key and note format as v3; v4 adds `transactWithAuthorization`. Arc testnet USDC and EURC both expose `receiveWithAuthorization` with the standard EIP-712 domain (name `USDC` / `EURC`, version `2`). Browser end-to-end check with a freshly funded employer account: a relayed EIP-3009 deposit of 0.5 USDC (1,743,610 gas, 0.05 USDC fee), after which the employer's account nonce was still 0 and it had no allowance to the vault or Permit2, so depositing required no transaction from the employer at all.

### 2026-10-13 testnet deployment (v3, multi-asset, retired)

| Contract | Address |
| --- | --- |
| VeilPayVault | `0x8BDE9530910d448727f098A8847197146DEbeC5E` (block 66918735) |
| TransactionVerifier | `0x5Da53d26627a2EC7900DfD06f2B05506b081930a` |
| Poseidon(2) | `0xf8B1FeF6e3D12BffDa4b60215E9290A297cBD50a` |

Allowlist: USDC `0x3600000000000000000000000000000000000000`, EURC `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`. Permit2: `0x000000000022D473030F116dDEE9F6B43aC78BA3`.

[v3 flow report](research/arc-vault-v3-testnet-flow-2026-10-13.json): the same deposit, payroll, withdrawal, visibility and double-spend checks as v1, all passing (1,650,835 / 1,622,924 / 1,668,323 gas). Browser end-to-end check on a USDC organization: a Permit2 deposit submitted by the relayer (1,749,426 gas, 0.05 USDC fee), private payroll whose transaction carries `asset = 0` and no token transfers (1,616,243 gas), a relayed withdrawal (1,666,922 gas), and a verification link checked against the vault. The EURC path is covered by the contract tests; it has not been run on testnet because the test accounts hold no EURC. The frontend only targets the current deployment; testnet balances in earlier vaults stay in those contracts. The user key-derivation message is frozen at the v1 text, so switching vaults does not change registered payout addresses.

### 2026-10-12 testnet deployment (v2, 16 outputs, retired)

| Contract | Address |
| --- | --- |
| VeilPayVault | `0x206b534BF9025AFc7B31f18639aE5DeA07dbf5Bb` (block 66832820) |
| TransactionVerifier | `0x16407bCA8d512C0f42Ec28C9FF50eD33C5847CB0` |
| Poseidon(2) | `0x75e8A8aFF131492125887cd9cB11C894b4271953` |

Browser end-to-end check: deposit 1 USDC (1,667,032 gas), private payroll to 4 people in one transaction (1,597,168 gas, 16 outputs), then an employee scans and makes a partial withdrawal. A full transaction pays 15 people, about 107k gas per person.

### 2026-10-12 testnet deployment (v1, 4 outputs, retired)

| Contract | Address |
| --- | --- |
| VeilPayVault | `0x99b143A677f49B13053Ec99C5fB16116bf0A49Ff` (block 66795653) |
| TransactionVerifier | `0xeaA45532F03CE35c0F816F8AC01aAF86dE669257` |
| Poseidon(2) | `0xD87d10cc49c3d04DaC256b533F95547017204e16` |

[Flow report](research/arc-vault-testnet-flow-2026-10-12.json): deposit 1 USDC (1,189,073 gas); private payroll of 0.2/0.3/0.4 plus 0.1 change (1,119,221 gas); withdraw 0.15 with a 0.01 fee, leaving 0.14 change (1,192,206 gas). Replaying a spent note was rejected by the node with `nullifier spent`; the vault balance of 0.84 USDC matches the ledger.

[Encrypted flow report](research/arc-vault-testnet-encrypted-flow-2026-10-12.json): the same flow rerun on the same vault with real ciphertexts. After each party scans on-chain events, the employer sees only the 0.1 change, Alice, Bob, and Carol see only 0.2, 0.3, and 0.4 respectively, and an outside wallet sees no notes at all; Bob rebuilds his post-withdrawal 0.14 balance from his seed alone. The payroll transaction calldata contains no plaintext amounts or memos.

A single `transact` costs about 1.12–1.20M gas locally, dominated by ~21 on-chain Poseidon calls. The prototype's Groth16 setup has a single participant and is for testing only; it must not hold real funds.

## Docs

- Product and protocol docs: the in-app `/docs` page (source: `web/src/pages/Docs.tsx`), covering the user guide, protocol design, privacy model, contract addresses, and API.
- [2026-10-12 mainnet pairing check](research/arc-bn254-check-2026-10-12.json): non-trivial BN254 pairing positive and negative tests against two Arc mainnet RPCs.
- [Reproduction with full vectors](research/arc-bn254-reproduction-2026-10-12.json): point addition, scalar multiplication, and pairing checks all pass on both mainnet RPCs.
- G0 Groth16 verification: an early minimal Poseidon commitment circuit confirmed that Arc can run a snarkjs-exported verifier. The experiment code has been removed; results are kept in the reports below.
- [G0 testnet results](research/arc-g0-groth16-testnet-2026-10-12.json), [G0 mainnet results](research/arc-g0-groth16-mainnet-2026-10-12.json): valid proofs pass, all 5 tampering cases are rejected, about 200,812 gas per verification.
- [Precompile check script](scripts/check_arc_bn254.py): read-only checks of the point addition, scalar multiplication, and pairing precompiles; sends no transactions and uses no wallet.

## Reproduce the basic compatibility check

The script uses only the Python standard library and needs access to Arc's public RPC.

```bash
python3 scripts/check_arc_bn254.py --network mainnet --output /tmp/veilpay-bn254-check.json
```

Use `--network testnet` to check testnet. A non-zero exit code means a network error or a mismatched test result; it alone does not prove the chain lacks the feature.

Passing the precompile check only shows the basic operations work. It does not replace testing the real Groth16 verifier contract, the payroll circuit, and the fund flow.
