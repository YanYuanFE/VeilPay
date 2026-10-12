// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IPoseidon2 {
    function poseidon(uint256[2] calldata inputs) external pure returns (uint256);
}

interface ITransactionVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[23] calldata pubSignals
    ) external view returns (bool);
}

/// Private USDC ledger: notes are Poseidon commitments in a Merkle tree, spent with Groth16 proofs.
/// No owner, no upgrade path, no selfdestruct/delegatecall. Amounts are USDC ERC-20 units (6 decimals).
contract VeilPayVault {
    uint256 public constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant LEVELS = 20;
    uint256 public constant N_OUTS = 16; // power of two: outputs are inserted as one aligned subtree
    uint256 constant SUBTREE_LEVELS = 4; // log2(N_OUTS)
    uint256 constant N_PUBLIC = 7 + N_OUTS;
    uint256 public constant ROOT_HISTORY = 32;
    uint256 public constant ZERO_LEAF = uint256(keccak256("veilpay.zero")) % FIELD_SIZE;

    IERC20 public immutable usdc;
    IPoseidon2 public immutable hasher;
    ITransactionVerifier public immutable verifier;
    uint256 public immutable domainTag;

    uint256[LEVELS] public zeros;
    uint256[LEVELS] public filledSubtrees;
    uint256[ROOT_HISTORY] public roots;
    uint256 public currentRootIndex;
    uint256 public nextIndex;
    mapping(uint256 => bool) public spentNullifiers;

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    struct ExtData {
        address recipient;
        address feeRecipient;
        bytes[N_OUTS] encryptedOutputs;
    }

    event NewCommitment(uint256 indexed commitment, uint256 index, bytes encryptedOutput);
    event NewNullifier(uint256 indexed nullifier);

    constructor(IERC20 usdc_, IPoseidon2 hasher_, ITransactionVerifier verifier_) {
        usdc = usdc_;
        hasher = hasher_;
        verifier = verifier_;
        domainTag = uint256(keccak256(abi.encode("veilpay.v1", block.chainid, address(this), address(usdc_)))) % FIELD_SIZE;

        uint256 z = ZERO_LEAF;
        for (uint256 i; i < LEVELS; i++) {
            zeros[i] = z;
            filledSubtrees[i] = z;
            z = hasher_.poseidon([z, z]);
        }
        roots[0] = z;
    }

    function transact(
        Proof calldata proof,
        uint256 root,
        uint256 nullifier,
        uint256[N_OUTS] calldata outCommitments,
        uint64 depositAmount,
        uint64 withdrawAmount,
        uint64 fee,
        ExtData calldata ext
    ) external {
        require(isKnownRoot(root), "unknown root");
        require(!spentNullifiers[nullifier], "nullifier spent");
        require(withdrawAmount == 0 || ext.recipient != address(0), "no recipient");
        require(fee == 0 || ext.feeRecipient != address(0), "no fee recipient");

        uint256[N_PUBLIC] memory pub;
        pub[0] = root;
        pub[1] = nullifier;
        for (uint256 i; i < N_OUTS; i++) pub[2 + i] = outCommitments[i];
        pub[2 + N_OUTS] = depositAmount;
        pub[3 + N_OUTS] = withdrawAmount;
        pub[4 + N_OUTS] = fee;
        pub[5 + N_OUTS] = hashExtData(ext);
        pub[6 + N_OUTS] = domainTag;
        require(verifier.verifyProof(proof.a, proof.b, proof.c, pub), "invalid proof");

        // effects before interactions; any failed transfer reverts the whole state change
        spentNullifiers[nullifier] = true;
        emit NewNullifier(nullifier);
        uint256 first = _insert(outCommitments);
        for (uint256 i; i < N_OUTS; i++) {
            emit NewCommitment(outCommitments[i], first + i, ext.encryptedOutputs[i]);
        }

        if (depositAmount > 0) {
            uint256 before = usdc.balanceOf(address(this));
            require(usdc.transferFrom(msg.sender, address(this), depositAmount), "deposit failed");
            require(usdc.balanceOf(address(this)) == before + depositAmount, "deposit mismatch");
        }
        if (withdrawAmount > 0) require(usdc.transfer(ext.recipient, withdrawAmount), "withdraw failed");
        if (fee > 0) require(usdc.transfer(ext.feeRecipient, fee), "fee failed");
    }

    function hashExtData(ExtData calldata ext) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(ext.recipient, ext.feeRecipient, ext.encryptedOutputs))) % FIELD_SIZE;
    }

    function isKnownRoot(uint256 root) public view returns (bool) {
        if (root == 0) return false;
        for (uint256 i; i < ROOT_HISTORY; i++) {
            if (roots[i] == root) return true;
        }
        return false;
    }

    function currentRoot() external view returns (uint256) {
        return roots[currentRootIndex];
    }

    /// Inserts N_OUTS leaves as one aligned subtree; returns the index of the first leaf.
    function _insert(uint256[N_OUTS] calldata leaves) internal returns (uint256 first) {
        first = nextIndex;
        require(first + N_OUTS <= 2 ** LEVELS, "tree full");

        // hash the batch pairwise up to its subtree root, in place
        uint256[N_OUTS] memory layer = leaves;
        for (uint256 width = N_OUTS / 2; width > 0; width /= 2) {
            for (uint256 i; i < width; i++) layer[i] = hasher.poseidon([layer[2 * i], layer[2 * i + 1]]);
        }
        uint256 cur = layer[0];
        uint256 idx = first >> SUBTREE_LEVELS;
        for (uint256 level = SUBTREE_LEVELS; level < LEVELS; level++) {
            if (idx & 1 == 0) {
                filledSubtrees[level] = cur;
                cur = hasher.poseidon([cur, zeros[level]]);
            } else {
                cur = hasher.poseidon([filledSubtrees[level], cur]);
            }
            idx >>= 1;
        }

        currentRootIndex = (currentRootIndex + 1) % ROOT_HISTORY;
        roots[currentRootIndex] = cur;
        nextIndex = first + N_OUTS;
    }
}
