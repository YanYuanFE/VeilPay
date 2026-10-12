// node --test prover/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { walletFromSeed, encryptNote, dummyNote, scan, CIPHERTEXT_BYTES, newSeed } from "./wallet.mjs";
import { noteCommitment, nullifierOf } from "./prove.mjs";

const DOMAIN = 17003763394764819681799826706735782989507548437524573251175545328610202944287n;
const alice = walletFromSeed(Buffer.alloc(32, 1));
const bob = walletFromSeed(Buffer.alloc(32, 2));

function onchain(note, index) {
  return { commitment: noteCommitment(DOMAIN, note.ownerTag, note.amount, note.rho), index, ciphertext: note.ciphertext };
}

test("recipient decrypts and verifies own note; others see nothing", () => {
  const n = encryptNote(alice.address, 2_000_000_000n, "2026-10 salary");
  const ev = [onchain(n, 4), onchain(encryptNote(bob.address, 3_000_000_000n), 5)];
  const mine = scan(alice, DOMAIN, ev);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].amount, 2_000_000_000n);
  assert.equal(mine[0].memo, "2026-10 salary");
  assert.equal(mine[0].index, 4);
  assert.equal(mine[0].nullifier, nullifierOf(alice.spendSecret, ev[0].commitment));
  assert.deepEqual(scan(bob, DOMAIN, ev).map((x) => x.amount), [3_000_000_000n]);
});

test("ciphertext attached to a different commitment is rejected", () => {
  const real = encryptNote(alice.address, 5n);
  const ev = { ...onchain(real, 0), commitment: noteCommitment(DOMAIN, real.ownerTag, 6n, real.rho) };
  assert.equal(scan(alice, DOMAIN, [ev]).length, 0);
});

test("note encrypted to my view key but owned by another ownerTag is rejected", () => {
  const forged = encryptNote({ ownerTag: bob.ownerTag, viewPub: alice.address.viewPub }, 7n);
  assert.equal(scan(alice, DOMAIN, [onchain(forged, 0)]).length, 0);
});

test("tampered ciphertext is rejected", () => {
  const n = encryptNote(alice.address, 9n);
  const flipped = n.ciphertext.slice(0, -2) + (n.ciphertext.endsWith("00") ? "01" : "00");
  assert.equal(scan(alice, DOMAIN, [{ ...onchain(n, 0), ciphertext: flipped }]).length, 0);
});

test("wrong domain (other vault/chain) is rejected", () => {
  const n = encryptNote(alice.address, 9n);
  assert.equal(scan(alice, DOMAIN + 1n, [onchain(n, 0)]).length, 0);
});

test("real and dummy ciphertexts have identical fixed length", () => {
  const sizes = [encryptNote(alice.address, 1n).ciphertext, encryptNote(alice.address, (1n << 64n) - 1n, "x".repeat(64)).ciphertext, dummyNote().ciphertext]
    .map((c) => (c.length - 2) / 2);
  assert.deepEqual(sizes, [CIPHERTEXT_BYTES, CIPHERTEXT_BYTES, CIPHERTEXT_BYTES]);
  assert.equal(CIPHERTEXT_BYTES, 153);
  assert.equal(scan(alice, DOMAIN, [onchain(dummyNote(), 0)]).length, 0);
});

test("bounds: amount must fit 64 bits, memo at most 64 bytes", () => {
  assert.throws(() => encryptNote(alice.address, 1n << 64n), /amount out of range/);
  assert.throws(() => encryptNote(alice.address, -1n), /amount out of range/);
  assert.throws(() => encryptNote(alice.address, 1n, "工".repeat(22)), /memo exceeds/); // 66 bytes
});

test("same seed recovers same keys; different seeds differ", () => {
  const seed = newSeed();
  const a = walletFromSeed(seed), b = walletFromSeed(Buffer.from(seed));
  assert.equal(a.spendSecret, b.spendSecret);
  assert.equal(a.address.viewPub, b.address.viewPub);
  assert.notEqual(a.ownerTag, alice.ownerTag);
  assert.notEqual(alice.address.viewPub, bob.address.viewPub);
});
