pragma circom 2.2.3;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// Root of a Poseidon Merkle path; index bits select left/right at each level.
template MerkleRoot(levels) {
    signal input leaf;
    signal input index;
    signal input siblings[levels];
    signal output root;

    component bits = Num2Bits(levels);
    bits.in <== index;

    component h[levels];
    signal cur[levels + 1];
    signal left[levels];
    cur[0] <== leaf;
    for (var i = 0; i < levels; i++) {
        left[i] <== cur[i] + bits.out[i] * (siblings[i] - cur[i]);
        h[i] = Poseidon(2);
        h[i].inputs[0] <== left[i];
        h[i].inputs[1] <== cur[i] + siblings[i] - left[i];
        cur[i + 1] <== h[i].out;
    }
    root <== cur[levels];
}

// commitment = Poseidon(domainTag, ownerTag, asset, amount, rho), amount < 2^64.
template NoteCommitment() {
    signal input domainTag;
    signal input ownerTag;
    signal input asset;
    signal input amount;
    signal input rho;
    signal output commitment;

    component range = Num2Bits(64);
    range.in <== amount;

    component h = Poseidon(5);
    h.inputs[0] <== domainTag;
    h.inputs[1] <== ownerTag;
    h.inputs[2] <== asset;
    h.inputs[3] <== amount;
    h.inputs[4] <== rho;
    commitment <== h.out;
}

// Spend one note, create nOuts notes, all of one asset (noteAsset):
//   inAmount + depositAmount == sum(outAmount) + withdrawAmount + fee
// A zero-amount input is a dummy (used for deposits) and skips the Merkle check.
// The public asset must equal noteAsset only when value enters or leaves; internal transfers keep it hidden.
template Transaction(levels, nOuts) {
    // public
    signal input root;
    signal input nullifier;
    signal input outCommitment[nOuts];
    signal input depositAmount;
    signal input withdrawAmount;
    signal input fee;
    signal input asset;
    signal input extDataHash;
    signal input domainTag;

    // private
    signal input noteAsset;
    signal input inSpendSecret;
    signal input inAmount;
    signal input inRho;
    signal input inIndex;
    signal input inSiblings[levels];
    signal input outOwnerTag[nOuts];
    signal input outAmount[nOuts];
    signal input outRho[nOuts];

    // input note ownership and nullifier
    component owner = Poseidon(1);
    owner.inputs[0] <== inSpendSecret;

    component inNote = NoteCommitment();
    inNote.domainTag <== domainTag;
    inNote.ownerTag <== owner.out;
    inNote.asset <== noteAsset;
    inNote.amount <== inAmount;
    inNote.rho <== inRho;

    component nf = Poseidon(3);
    nf.inputs[0] <== 1; // nullifier domain
    nf.inputs[1] <== inSpendSecret;
    nf.inputs[2] <== inNote.commitment;
    nullifier === nf.out;

    // membership, enforced only for non-zero input
    component tree = MerkleRoot(levels);
    tree.leaf <== inNote.commitment;
    tree.index <== inIndex;
    for (var i = 0; i < levels; i++) tree.siblings[i] <== inSiblings[i];
    component rootCheck = ForceEqualIfEnabled();
    rootCheck.enabled <== inAmount;
    rootCheck.in[0] <== root;
    rootCheck.in[1] <== tree.root;

    // outputs
    component outNote[nOuts];
    var outSum = 0;
    for (var i = 0; i < nOuts; i++) {
        outNote[i] = NoteCommitment();
        outNote[i].domainTag <== domainTag;
        outNote[i].ownerTag <== outOwnerTag[i];
        outNote[i].asset <== noteAsset;
        outNote[i].amount <== outAmount[i];
        outNote[i].rho <== outRho[i];
        outCommitment[i] === outNote[i].commitment;
        outSum += outAmount[i];
    }

    // public amounts are 64-bit; all sums stay far below the field modulus
    component depRange = Num2Bits(64);
    depRange.in <== depositAmount;
    component wdRange = Num2Bits(64);
    wdRange.in <== withdrawAmount;
    component feeRange = Num2Bits(64);
    feeRange.in <== fee;

    inAmount + depositAmount === outSum + withdrawAmount + fee;

    // public value movement must name the notes' asset
    (depositAmount + withdrawAmount + fee) * (asset - noteAsset) === 0;

    // bind extDataHash into the constraint system
    signal extDataSquare <== extDataHash * extDataHash;
}

component main {public [root, nullifier, outCommitment, depositAmount, withdrawAmount, fee, asset, extDataHash, domainTag]} = Transaction(20, 16);
