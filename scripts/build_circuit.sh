#!/usr/bin/env bash
# Compile the transaction circuit, run a local Groth16 setup, export verifier + Poseidon bytecode.
set -euo pipefail
cd "$(dirname "$0")/.."
B=build; mkdir -p $B
SNARK="npx snarkjs"

npx circom2 circuits/transaction.circom --r1cs --wasm -o $B
$SNARK r1cs info $B/transaction.r1cs

# ponytail: single local contributor + random beacon; NOT a trusted ceremony, prototype only.
if [ ! -f $B/pot15_final.ptau ]; then
  $SNARK powersoftau new bn128 15 $B/pot15_0.ptau
  $SNARK powersoftau contribute $B/pot15_0.ptau $B/pot15_1.ptau --name=veilpay -e="$(openssl rand -hex 32)"
  $SNARK powersoftau prepare phase2 $B/pot15_1.ptau $B/pot15_final.ptau
  rm $B/pot15_0.ptau $B/pot15_1.ptau
fi
$SNARK groth16 setup $B/transaction.r1cs $B/pot15_final.ptau $B/transaction_0.zkey
$SNARK zkey contribute $B/transaction_0.zkey $B/transaction_1.zkey --name=veilpay -e="$(openssl rand -hex 32)"
$SNARK zkey beacon $B/transaction_1.zkey $B/transaction_final.zkey "$(openssl rand -hex 32)" 10
rm $B/transaction_0.zkey $B/transaction_1.zkey
$SNARK zkey verify $B/transaction.r1cs $B/pot15_final.ptau $B/transaction_final.zkey
$SNARK zkey export verificationkey $B/transaction_final.zkey $B/transaction_vkey.json

$SNARK zkey export solidityverifier $B/transaction_final.zkey contracts/src/TransactionVerifier.sol
# a new setup needs a new verifier deployment and a new /zk/vN path (artifacts are cached immutably)
mkdir -p web/public/zk/v2
cp $B/transaction_js/transaction.wasm $B/transaction_final.zkey web/public/zk/v2/
sed -i '' 's/contract Groth16Verifier/contract TransactionVerifier/' contracts/src/TransactionVerifier.sol
node -e 'import("circomlibjs").then(m=>process.stdout.write(m.poseidonContract.createCode(2)))' > $B/poseidon2.hex
