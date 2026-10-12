// In-browser Groth16 proving for the transaction circuit (1 input, N_OUTS outputs, depth-20 tree).
import * as snarkjs from 'snarkjs'
import type { ContractFunctionArgs } from 'viem'
import { N_OUTS } from './config'
import { merklePath, noteCommitment, nullifierOf, poseidonOwner } from './crypto'
import type { vaultAbi } from './vaultAbi'

type TransactInputs = ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transact'>

const WASM_URL = '/zk/v2/transaction.wasm'
const ZKEY_URL = '/zk/v2/transaction_final.zkey'

export type ProveRequest = {
  domainTag: bigint
  extDataHash: bigint
  depositAmount: bigint
  withdrawAmount: bigint
  fee: bigint
  leaves: bigint[]
  input: { spendSecret: bigint; amount: bigint; rho: bigint; index: number }
  outs: { ownerTag: bigint; amount: bigint; rho: bigint }[]
}

export type TransactArgs = {
  proof: { a: [bigint, bigint]; b: [[bigint, bigint], [bigint, bigint]]; c: [bigint, bigint] }
  root: bigint
  nullifier: bigint
  outCommitments: TransactInputs[3]
}

export async function prove(req: ProveRequest): Promise<TransactArgs> {
  if (req.outs.length !== N_OUTS) throw new Error(`exactly ${N_OUTS} outputs required`)
  const inCommitment = noteCommitment(req.domainTag, poseidonOwner(req.input.spendSecret), req.input.amount, req.input.rho)
  const nullifier = nullifierOf(req.input.spendSecret, inCommitment)
  const { siblings, root } = merklePath(req.leaves, req.input.index)
  const outCommitments = req.outs.map((o) => noteCommitment(req.domainTag, o.ownerTag, o.amount, o.rho)) as unknown as TransactArgs['outCommitments']

  const s = (x: bigint | number) => x.toString()
  const witness = {
    root: s(root), nullifier: s(nullifier), outCommitment: outCommitments.map(s),
    depositAmount: s(req.depositAmount), withdrawAmount: s(req.withdrawAmount), fee: s(req.fee),
    extDataHash: s(req.extDataHash), domainTag: s(req.domainTag),
    inSpendSecret: s(req.input.spendSecret), inAmount: s(req.input.amount), inRho: s(req.input.rho), inIndex: s(req.input.index),
    inSiblings: siblings.map(s),
    outOwnerTag: req.outs.map((o) => s(o.ownerTag)), outAmount: req.outs.map((o) => s(o.amount)), outRho: req.outs.map((o) => s(o.rho)),
  }
  const { proof } = await snarkjs.groth16.fullProve(witness, WASM_URL, ZKEY_URL)
  const n = (x: string) => BigInt(x)
  return {
    // G2 coordinates are reversed for the EVM precompile encoding
    proof: {
      a: [n(proof.pi_a[0]), n(proof.pi_a[1])],
      b: [[n(proof.pi_b[0][1]), n(proof.pi_b[0][0])], [n(proof.pi_b[1][1]), n(proof.pi_b[1][0])]],
      c: [n(proof.pi_c[0]), n(proof.pi_c[1])],
    },
    root,
    nullifier,
    outCommitments,
  }
}
