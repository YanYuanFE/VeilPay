// Usage: node prover/prove.mjs '<json>'  (or import { prove })
// Builds the Merkle tree from all leaves, generates a transaction proof, returns ABI words:
// a[2], b[2][2] (EVM order), c[2], root, nullifier, outCommitments[16].
// req.noteAsset is the private asset of every note; req.asset the public one (0 when nothing enters or leaves).
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import sha3 from "js-sha3";

const LEVELS = 20;
export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
// the one copy of the proving artifacts, also served by the web app; must match the deployed verifier
const ZK = new URL("../web/public/zk/v3/", import.meta.url).pathname;

const poseidon = await buildPoseidon();
export const H = (...xs) => poseidon.F.toObject(poseidon(xs));
export const noteCommitment = (domainTag, ownerTag, asset, amount, rho) => H(domainTag, ownerTag, asset, amount, rho);
export const nullifierOf = (spendSecret, commitment) => H(1n, spendSecret, commitment);
const ZERO_LEAF = BigInt("0x" + sha3.keccak256("veilpay.zero")) % FIELD;

function merklePath(leaves, index) {
  let level = leaves.slice();
  let zero = ZERO_LEAF;
  const siblings = [];
  for (let i = 0; i < LEVELS; i++) {
    siblings.push(level[index ^ 1] ?? zero);
    const next = [];
    for (let j = 0; j < level.length; j += 2) next.push(H(level[j], level[j + 1] ?? zero));
    level = next;
    zero = H(zero, zero);
    index >>= 1;
  }
  return { siblings, root: level[0] ?? zero };
}

export async function prove(req) {
  const big = (x) => BigInt(x);
  const domainTag = big(req.domainTag);
  const leaves = req.leaves.map(big);
  const inp = req.in;
  const noteAsset = big(req.noteAsset);
  const inIndex = Number(inp.index ?? 0);

  const inOwner = H(big(inp.spendSecret));
  const inCommitment = noteCommitment(domainTag, inOwner, noteAsset, big(inp.amount), big(inp.rho));
  const nullifier = nullifierOf(big(inp.spendSecret), inCommitment);
  const { siblings, root } = merklePath(leaves, inIndex);

  const outs = req.outs.map((o) => {
    const ownerTag = o.ownerTag !== undefined ? big(o.ownerTag) : H(big(o.ownerSecret));
    return { ownerTag, amount: big(o.amount), rho: big(o.rho) };
  });
  const outCommitment = outs.map((o) => noteCommitment(domainTag, o.ownerTag, noteAsset, o.amount, o.rho));

  const input = {
    root, nullifier, outCommitment,
    depositAmount: big(req.depositAmount), withdrawAmount: big(req.withdrawAmount), fee: big(req.fee),
    asset: big(req.asset), extDataHash: big(req.extDataHash), domainTag, noteAsset,
    inSpendSecret: big(inp.spendSecret), inAmount: big(inp.amount), inRho: big(inp.rho), inIndex,
    inSiblings: siblings,
    outOwnerTag: outs.map((o) => o.ownerTag), outAmount: outs.map((o) => o.amount), outRho: outs.map((o) => o.rho),
  };
  const stringify = (v) => (Array.isArray(v) ? v.map(stringify) : v.toString());
  const witness = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, stringify(v)]));

  const { proof } = await snarkjs.groth16.fullProve(
    witness, ZK + "transaction.wasm", ZK + "transaction_final.zkey");
  const b = proof.pi_b;
  const words = [
    proof.pi_a[0], proof.pi_a[1], b[0][1], b[0][0], b[1][1], b[1][0], proof.pi_c[0], proof.pi_c[1],
    root, nullifier, ...outCommitment,
  ].map((w) => BigInt(w));
  return words;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const words = await prove(JSON.parse(process.argv[2]));
  process.stdout.write("0x" + words.map((w) => w.toString(16).padStart(64, "0")).join(""));
  process.exit(0);
}
