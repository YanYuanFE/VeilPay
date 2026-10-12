// Prints golden vectors from the Node implementation; web/src/lib/veilpay tests must reproduce them.
import { walletFromSeed, encryptNote } from "./wallet.mjs";
import { noteCommitment, nullifierOf, H } from "./prove.mjs";
import sha3 from "js-sha3";

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const w = walletFromSeed(Buffer.alloc(32, 7));
const domainTag = 17003763394764819681799826706735782989507548437524573251175545328610202944287n;
const amount = 123_456_789n, rho = 987654321987654321n;
const commitment = noteCommitment(domainTag, w.ownerTag, amount, rho);
const zeroLeaf = BigInt("0x" + sha3.keccak256("veilpay.zero")) % FIELD;
const note = encryptNote(w.address, amount, "golden memo", rho);
const out = {
  seedHex: "07".repeat(32),
  spendSecret: w.spendSecret.toString(),
  ownerTag: w.ownerTag.toString(),
  viewPub: w.address.viewPub,
  domainTag: domainTag.toString(),
  amount: amount.toString(),
  rho: rho.toString(),
  commitment: commitment.toString(),
  nullifier: nullifierOf(w.spendSecret, commitment).toString(),
  zeroLeaf: zeroLeaf.toString(),
  h12: H(1n, 2n).toString(),
  ciphertext: note.ciphertext,
  memo: "golden memo",
};
console.log(JSON.stringify(out, null, 2));
