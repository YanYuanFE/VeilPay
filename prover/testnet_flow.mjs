// Arc testnet end-to-end flow against a deployed VeilPayVault, driven by cast so USDC runs on real Arc nodes.
// Usage: PRIVATE_KEY=0x.. node prover/testnet_flow.mjs <vault> <deployBlock> <reportPath>
// Steps: deposit 1 USDC -> private payroll 0.2/0.3/0.4 + 0.1 change -> each party scans and decrypts
//        -> Bob withdraws 0.15 + 0.01 fee, 0.14 change -> Bob's balance rebuilt from seed + chain events only.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import sha3 from "js-sha3";
import { prove } from "./prove.mjs";
import { walletFromSeed, encryptNote, dummyNote, scan, randomField } from "./wallet.mjs";

const RPC = "https://rpc.testnet.arc.io";
const USDC = "0x3600000000000000000000000000000000000000";
const U = 1_000_000n;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const N_OUTS = 16
const TRANSACT_SIG =
  `transact((uint256[2],uint256[2][2],uint256[2]),uint256,uint256,uint256[${N_OUTS}],uint64,uint64,uint64,(address,address,bytes[${N_OUTS}]))`;

const [vault, deployBlock, reportPath] = process.argv.slice(2);
const key = process.env.PRIVATE_KEY;
if (!vault || !deployBlock || !reportPath || !key) throw new Error("usage: PRIVATE_KEY=.. node testnet_flow.mjs <vault> <deployBlock> <reportPath>");

// Errors carry only stderr: the default error object would print argv, which includes the private key.
function run(args) {
  try {
    return execFileSync("cast", args, { encoding: "utf8", stdio: "pipe" }).trim();
  } catch (err) {
    throw new Error("cast failed: " + String(err.stderr).trim());
  }
}
const cast = (...args) => run([...args, "--rpc-url", RPC]);
const first = (s) => s.split(" ")[0];
// ponytail: demo seeds derived from the deployer key so runs are reproducible; real clients use newSeed().
const seedFor = (label) => Buffer.from(sha3.keccak256(`${key}:veilpay.wallet:${label}`), "hex");

const me = run(["wallet", "address", "--private-key", key]);
const employeeWallet = run(["wallet", "address", "--private-key", "0x" + sha3.keccak256(`${key}:veilpay.employee-eoa`)]);
const domainTag = first(cast("call", vault, "domainTag()(uint256)"));
const balance = (who) => BigInt(first(cast("call", USDC, "balanceOf(address)(uint256)", who)));
const isSpent = (n) => first(cast("call", vault, "spentNullifiers(uint256)(bool)", n.toString())) === "true";

/// All NewCommitment events in index order: { commitment, index, ciphertext }.
function chainEvents() {
  const logs = JSON.parse(cast("logs", "--json", "--address", vault, "--from-block", deployBlock,
    "NewCommitment(uint256 indexed,uint256,bytes)"));
  const evs = logs.map((l) => {
    const d = l.data.slice(2);
    const word = (i) => BigInt("0x" + d.slice(i * 64, (i + 1) * 64));
    const len = Number(word(2));
    return { commitment: BigInt(l.topics[1]), index: Number(word(0)), ciphertext: "0x" + d.slice(192, 192 + len * 2) };
  }).sort((a, b) => a.index - b.index);
  evs.forEach((e, k) => { if (e.index !== k) throw new Error("gap in commitment indices at " + k); });
  return evs;
}

const unspent = (w) => scan(w, domainTag, chainEvents()).filter((n) => !isSpent(n.nullifier));

/// Fisher-Yates with a CSPRNG so the real output's position does not leak.
function shuffle(xs) {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const steps = [];
async function transact(name, spender, inNote, outNotes, dep, wd, fee, recipient, feeRecipient) {
  const outs = shuffle([...outNotes, ...Array.from({ length: N_OUTS - outNotes.length }, dummyNote)]);
  const tuple = `(${recipient},${feeRecipient},[${outs.map((o) => o.ciphertext).join(",")}])`;
  const extDataHash = first(cast("call", vault, `hashExtData((address,address,bytes[${N_OUTS}]))(uint256)`, tuple));
  const input = inNote
    ? { spendSecret: spender.spendSecret.toString(), amount: inNote.amount.toString(), rho: inNote.rho.toString(), index: inNote.index }
    : { spendSecret: randomField().toString(), amount: "0", rho: "0", index: 0 };
  const w = await prove({
    domainTag, extDataHash, depositAmount: dep.toString(), withdrawAmount: wd.toString(), fee: fee.toString(),
    leaves: chainEvents().map((e) => e.commitment.toString()), in: input,
    outs: outs.map((o) => ({ ownerTag: o.ownerTag.toString(), amount: o.amount.toString(), rho: o.rho.toString() })),
  });
  const onchainRoot = first(cast("call", vault, "currentRoot()(uint256)"));
  if (onchainRoot !== w[8].toString()) throw new Error(`${name}: prover root ${w[8]} != vault root ${onchainRoot}`);

  const args = [`([${w[0]},${w[1]}],[[${w[2]},${w[3]}],[${w[4]},${w[5]}]],[${w[6]},${w[7]}])`, w[8].toString(), w[9].toString(),
    `[${w.slice(10).join(",")}]`, dep.toString(), wd.toString(), fee.toString(), tuple];
  const receipt = JSON.parse(cast("send", "--json", "--private-key", key, vault, TRANSACT_SIG, ...args));
  if (receipt.status !== "0x1") throw new Error(`${name} failed: ${receipt.transactionHash}`);
  steps.push({ name, tx: receipt.transactionHash, block: Number(receipt.blockNumber), gasUsed: Number(receipt.gasUsed) });
  console.log(name, receipt.transactionHash, "gas", Number(receipt.gasUsed));
  return args;
}

const employer = walletFromSeed(seedFor("employer"));
const alice = walletFromSeed(seedFor("alice"));
const bob = walletFromSeed(seedFor("bob"));
const carol = walletFromSeed(seedFor("carol"));
const outsider = walletFromSeed(seedFor("outsider"));
const before = { me: balance(me), vault: balance(vault), employee: balance(employeeWallet) };
const leavesBefore = chainEvents().length;

const approve = JSON.parse(cast("send", "--json", "--private-key", key, USDC, "approve(address,uint256)", vault, U.toString()));
if (approve.status !== "0x1") throw new Error("approve failed");

// 1. employer deposits 1 USDC into its own note
await transact("deposit", null, null,
  [encryptNote(employer.address, U, "treasury deposit"), dummyNote(), dummyNote(), dummyNote()], U, 0n, 0n, ZERO_ADDR, ZERO_ADDR);

// 2. employer finds its note by scanning, then pays three employees by payment address
const funding = unspent(employer).find((n) => n.amount === U && n.memo === "treasury deposit");
if (!funding) throw new Error("employer cannot find its deposit note");
await transact("payroll", employer, funding, [
  encryptNote(alice.address, U * 2n / 10n, "2026-10 salary"),
  encryptNote(bob.address, U * 3n / 10n, "2026-10 salary"),
  encryptNote(carol.address, U * 4n / 10n, "2026-10 salary"),
  encryptNote(employer.address, U / 10n, "payroll change"),
], 0n, 0n, 0n, ZERO_ADDR, ZERO_ADDR);

// 3. each party sees only its own notes
const view = (w) => unspent(w).map((n) => ({ amount: n.amount.toString(), memo: n.memo, index: n.index }));
const visibility = { employer: view(employer), alice: view(alice), bob: view(bob), carol: view(carol), outsider: view(outsider) };

// 4. Bob withdraws part of his salary through a fee-taking relayer (the deployer here)
const bobNote = unspent(bob).find((n) => n.amount === U * 3n / 10n);
if (!bobNote) throw new Error("bob cannot find his salary note");
const wdArgs = await transact("withdraw", bob, bobNote,
  [encryptNote(bob.address, U * 14n / 100n, "change after withdrawal"), dummyNote(), dummyNote(), dummyNote()],
  0n, U * 15n / 100n, U / 100n, employeeWallet, me);

// 5. recovery: a fresh wallet object from Bob's seed alone, rebuilt from chain events
const recovered = unspent(walletFromSeed(seedFor("bob"))).map((n) => n.amount.toString());

// 6. replaying the spent note must be rejected by the node (estimate only, no tx)
let doubleSpend;
try {
  cast("estimate", "--from", me, vault, TRANSACT_SIG, ...wdArgs);
  doubleSpend = "ACCEPTED";
} catch (err) {
  doubleSpend = /nullifier spent/.test(err.message) ? "rejected: nullifier spent" : "rejected: " + err.message.slice(0, 200);
}

const after = { me: balance(me), vault: balance(vault), employee: balance(employeeWallet) };
const amounts = (xs) => JSON.stringify(xs.map((x) => x.amount));
const expect = (...xs) => JSON.stringify(xs.map(String));
const checks = {
  employer_sees_only_change: amounts(visibility.employer) === expect(U / 10n),
  alice_sees_0_2: amounts(visibility.alice) === expect(U * 2n / 10n),
  bob_sees_0_3: amounts(visibility.bob) === expect(U * 3n / 10n),
  carol_sees_0_4: amounts(visibility.carol) === expect(U * 4n / 10n),
  outsider_sees_nothing: visibility.outsider.length === 0,
  bob_recovered_0_14_from_seed: JSON.stringify(recovered) === expect(U * 14n / 100n),
  vault_gained_0_84: after.vault - before.vault === U * 84n / 100n,
  employee_received_0_15: after.employee - before.employee === U * 15n / 100n,
  double_spend_rejected: doubleSpend === "rejected: nullifier spent",
  leaves_added: chainEvents().length - leavesBefore === 3 * N_OUTS,
};
const str = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toString()]));
const report = {
  checked_at_utc: new Date().toISOString(), network: "testnet", chain_id: 5042002,
  vault, deployer: me, employee_wallet: employeeWallet, deploy_block: Number(deployBlock),
  note_encryption: "libsodium crypto_box_seal (X25519 + XSalsa20-Poly1305), 105-byte plaintext, 153-byte ciphertext",
  approve_tx: approve.transactionHash, steps, visibility_after_payroll: visibility, bob_recovered_unspent: recovered,
  double_spend: doubleSpend, usdc_6dec: { before: str(before), after: str(after) },
  checks, passed: Object.values(checks).every(Boolean),
  scope: "Prototype single-party Groth16 setup; demo seeds derived from deployer key; not audited.",
};
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ checks, passed: report.passed }, null, 2));
process.exit(report.passed ? 0 : 1);
