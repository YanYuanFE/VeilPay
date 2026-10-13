// VeilPay wallet: key derivation, note encryption (libsodium sealed box), and chain-event scanning.
//
// seed (32 random bytes, the only thing to back up)
//   spendSecret = blake2b-512(seed, "veilpay.spend.v1") mod r      -> spends notes, never shared
//   viewKeypair = X25519 from blake2b-256(seed, "veilpay.view.v1") -> decrypts notes, can be shared for audit
// Payment address given to the employer: { ownerTag = Poseidon(spendSecret), viewPub }.
//
// Plaintext (125 bytes): version(1)=2 | asset(20, ERC-20 address) | amount(8, big-endian) | rho(32) | memo(64, UTF-8, zero-padded)
// Ciphertext: crypto_box_seal(plaintext, viewPub) = 173 bytes. Dummy outputs are sealed to throwaway keys.
import sodiumModule from "libsodium-wrappers";
import { randomBytes } from "node:crypto";
import { FIELD, H, noteCommitment, nullifierOf } from "./prove.mjs";

await sodiumModule.ready;
const sodium = sodiumModule;

const VERSION = 2;
const MEMO_BYTES = 64;
const PLAINTEXT_BYTES = 1 + 20 + 8 + 32 + MEMO_BYTES;
export const CIPHERTEXT_BYTES = PLAINTEXT_BYTES + sodium.crypto_box_SEALBYTES;

const toBig = (bytes) => BigInt("0x" + Buffer.from(bytes).toString("hex"));
const toBytes = (x, n) => Buffer.from(x.toString(16).padStart(n * 2, "0"), "hex");
const kdf = (seed, label, len) => sodium.crypto_generichash(len, Buffer.from(label), seed);

/// Uniform field element (512-bit reduction keeps bias negligible).
export const randomField = () => toBig(randomBytes(64)) % FIELD;

export function newSeed() {
  return randomBytes(32);
}

export function walletFromSeed(seed) {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const spendSecret = toBig(kdf(seed, "veilpay.spend.v1", 64)) % FIELD;
  const view = sodium.crypto_box_seed_keypair(kdf(seed, "veilpay.view.v1", 32));
  const ownerTag = H(spendSecret);
  return {
    spendSecret,
    ownerTag,
    viewPub: view.publicKey,
    viewPriv: view.privateKey,
    address: { ownerTag, viewPub: Buffer.from(view.publicKey).toString("hex") },
  };
}

/// Encrypts a note of `asset` (uint160 bigint) for a payment address. Returns { ownerTag, asset, amount, rho, ciphertext(hex) }.
export function encryptNote(address, asset, amount, memo = "", rho = randomField()) {
  if (amount < 0n || amount >= 1n << 64n) throw new Error("amount out of range");
  if (asset < 0n || asset >= 1n << 160n) throw new Error("asset out of range");
  const memoBytes = Buffer.from(memo, "utf8");
  if (memoBytes.length > MEMO_BYTES) throw new Error(`memo exceeds ${MEMO_BYTES} bytes`);
  const pt = Buffer.concat([Buffer.from([VERSION]), toBytes(asset, 20), toBytes(amount, 8), toBytes(rho, 32), memoBytes, Buffer.alloc(MEMO_BYTES - memoBytes.length)]);
  const ct = sodium.crypto_box_seal(pt, Buffer.from(address.viewPub, "hex"));
  return { ownerTag: BigInt(address.ownerTag), asset, amount, rho, ciphertext: "0x" + Buffer.from(ct).toString("hex") };
}

/// Zero-value output owned by nobody, indistinguishable in size from a real one; `asset` must be the transaction's.
export function dummyNote(asset) {
  const throwaway = sodium.crypto_box_keypair();
  return encryptNote({ ownerTag: randomField(), viewPub: Buffer.from(throwaway.publicKey).toString("hex") }, asset, 0n);
}

/// Decrypts one ciphertext; returns null if not ours or malformed.
function tryDecrypt(wallet, ciphertextHex) {
  const ct = Buffer.from(ciphertextHex.replace(/^0x/, ""), "hex");
  if (ct.length !== CIPHERTEXT_BYTES) return null;
  let pt;
  try {
    pt = Buffer.from(sodium.crypto_box_seal_open(ct, wallet.viewPub, wallet.viewPriv));
  } catch {
    return null; // not addressed to this wallet or tampered
  }
  if (pt.length !== PLAINTEXT_BYTES || pt[0] !== VERSION) return null;
  const memo = pt.subarray(61).toString("utf8").replace(/\0+$/, "");
  return { asset: toBig(pt.subarray(1, 21)), amount: toBig(pt.subarray(21, 29)), rho: toBig(pt.subarray(29, 61)), memo };
}

/// Finds this wallet's notes among NewCommitment events [{ commitment, index, ciphertext }].
/// A decrypted note counts only if it re-hashes to the on-chain commitment under this wallet's ownerTag.
export function scan(wallet, domainTag, events) {
  const notes = [];
  for (const ev of events) {
    const n = tryDecrypt(wallet, ev.ciphertext);
    if (!n || n.amount === 0n) continue;
    const commitment = noteCommitment(BigInt(domainTag), wallet.ownerTag, n.asset, n.amount, n.rho);
    if (commitment !== BigInt(ev.commitment)) continue;
    notes.push({ ...n, index: ev.index, commitment, nullifier: nullifierOf(wallet.spendSecret, commitment) });
  }
  return notes;
}
