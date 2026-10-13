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
        uint256[24] calldata pubSignals
    ) external view returns (bool);
}

/// Uniswap Permit2 SignatureTransfer, the subset VeilPay uses.
interface IPermit2 {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitWitnessTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes32 witness,
        string calldata witnessTypeString,
        bytes calldata signature
    ) external;
}

/// EIP-3009 receive-side transfer (Circle FiatToken: USDC, EURC). Reverts unless msg.sender == to.
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// Private multi-asset ledger: notes are Poseidon commitments in a Merkle tree, spent with Groth16 proofs.
/// Every note carries an asset; one transaction moves one asset, which is public only when value enters or leaves.
/// The owner can only add assets to the allowlist, never remove them; there is no upgrade path,
/// no selfdestruct/delegatecall. Amounts are the asset's ERC-20 units.
contract VeilPayVault {
    uint256 public constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant LEVELS = 20;
    uint256 public constant N_OUTS = 16; // power of two: outputs are inserted as one aligned subtree
    uint256 constant SUBTREE_LEVELS = 4; // log2(N_OUTS)
    uint256 constant N_PUBLIC = 8 + N_OUTS;
    uint256 public constant ROOT_HISTORY = 32;
    uint256 public constant ZERO_LEAF = uint256(keccak256("veilpay.zero")) % FIELD_SIZE;

    /// Signed-deposit binding, used as the Permit2 witness and as the EIP-3009 nonce.
    bytes32 public constant DEPOSIT_TYPEHASH = keccak256("VeilPayDeposit(uint256[16] outCommitments,uint256 extDataHash)");
    string public constant DEPOSIT_WITNESS_TYPE =
        "VeilPayDeposit witness)TokenPermissions(address token,uint256 amount)VeilPayDeposit(uint256[16] outCommitments,uint256 extDataHash)";

    IPoseidon2 public immutable hasher;
    ITransactionVerifier public immutable verifier;
    IPermit2 public immutable permit2;
    address public immutable owner;
    uint256 public immutable domainTag;

    uint256[LEVELS] public zeros;
    uint256[LEVELS] public filledSubtrees;
    uint256[ROOT_HISTORY] public roots;
    uint256 public currentRootIndex;
    uint256 public nextIndex;
    mapping(uint256 => bool) public spentNullifiers;
    mapping(address => bool) public assetAllowed;

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    /// Proof and public inputs. `asset` must be zero when no value enters or leaves.
    struct TxArgs {
        Proof proof;
        uint256 root;
        uint256 nullifier;
        uint256[N_OUTS] outCommitments;
        address asset;
        uint64 depositAmount;
        uint64 withdrawAmount;
        uint64 fee;
    }

    struct ExtData {
        address recipient;
        address feeRecipient;
        bytes[N_OUTS] encryptedOutputs;
    }

    /// Permit2 signature from `owner`, who funds the deposit; anyone may submit it.
    struct Permit2Deposit {
        address owner;
        uint256 nonce;
        uint256 deadline;
        bytes signature;
    }

    /// EIP-3009 ReceiveWithAuthorization signature from `from`, who funds the deposit; anyone may submit it.
    struct Authorization {
        address from;
        uint256 validAfter;
        uint256 validBefore;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    event NewCommitment(uint256 indexed commitment, uint256 index, bytes encryptedOutput);
    event NewNullifier(uint256 indexed nullifier);
    event AssetAdded(address indexed asset);

    constructor(address[] memory assets, IPoseidon2 hasher_, ITransactionVerifier verifier_, IPermit2 permit2_) {
        hasher = hasher_;
        verifier = verifier_;
        permit2 = permit2_;
        owner = msg.sender;
        domainTag = uint256(keccak256(abi.encode("veilpay.v3", block.chainid, address(this)))) % FIELD_SIZE;
        for (uint256 i; i < assets.length; i++) _addAsset(assets[i]);

        uint256 z = ZERO_LEAF;
        for (uint256 i; i < LEVELS; i++) {
            zeros[i] = z;
            filledSubtrees[i] = z;
            z = hasher_.poseidon([z, z]);
        }
        roots[0] = z;
    }

    /// Add-only: removing an asset would strand notes that hold it.
    function addAsset(address asset) external {
        require(msg.sender == owner, "not owner");
        _addAsset(asset);
    }

    /// Deposits pull from msg.sender via a plain ERC-20 allowance.
    function transact(TxArgs calldata t, ExtData calldata ext) external {
        _verifyAndRecord(t, ext);
        if (t.depositAmount > 0) {
            IERC20 token = IERC20(t.asset);
            uint256 before = token.balanceOf(address(this));
            require(token.transferFrom(msg.sender, address(this), t.depositAmount), "deposit failed");
            require(token.balanceOf(address(this)) == before + t.depositAmount, "deposit mismatch");
        }
        _payOut(t, ext);
    }

    /// Deposit funded by a Permit2 signature; the witness binds the signature to these outputs and ext data,
    /// so a relayer or front-runner cannot redirect the funds.
    function transactWithPermit2(TxArgs calldata t, ExtData calldata ext, Permit2Deposit calldata p) external {
        require(t.depositAmount > 0, "no deposit");
        uint256 extHash = _verifyAndRecord(t, ext);
        IERC20 token = IERC20(t.asset);
        uint256 before = token.balanceOf(address(this));
        permit2.permitWitnessTransferFrom(
            IPermit2.PermitTransferFrom(IPermit2.TokenPermissions(t.asset, t.depositAmount), p.nonce, p.deadline),
            IPermit2.SignatureTransferDetails(address(this), t.depositAmount),
            p.owner,
            depositWitness(t.outCommitments, extHash),
            DEPOSIT_WITNESS_TYPE,
            p.signature
        );
        require(token.balanceOf(address(this)) == before + t.depositAmount, "deposit mismatch");
        _payOut(t, ext);
    }

    /// Deposit funded by an EIP-3009 authorization, needing no prior approval. Its nonce is depositWitness(...),
    /// so the signature only funds these outputs and ext data, and only once.
    function transactWithAuthorization(TxArgs calldata t, ExtData calldata ext, Authorization calldata a) external {
        require(t.depositAmount > 0, "no deposit");
        uint256 extHash = _verifyAndRecord(t, ext);
        IERC20 token = IERC20(t.asset);
        uint256 before = token.balanceOf(address(this));
        IERC3009(t.asset).receiveWithAuthorization(
            a.from, address(this), t.depositAmount, a.validAfter, a.validBefore,
            depositWitness(t.outCommitments, extHash), a.v, a.r, a.s
        );
        require(token.balanceOf(address(this)) == before + t.depositAmount, "deposit mismatch");
        _payOut(t, ext);
    }

    function depositWitness(uint256[N_OUTS] calldata outCommitments, uint256 extDataHash) public pure returns (bytes32) {
        return keccak256(abi.encode(DEPOSIT_TYPEHASH, keccak256(abi.encodePacked(outCommitments)), extDataHash));
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

    function _addAsset(address asset) internal {
        require(asset != address(0), "zero asset");
        require(!assetAllowed[asset], "asset exists");
        assetAllowed[asset] = true;
        emit AssetAdded(asset);
    }

    /// Checks the proof and public inputs, then spends the nullifier and inserts the outputs. Returns extDataHash.
    function _verifyAndRecord(TxArgs calldata t, ExtData calldata ext) internal returns (uint256 extHash) {
        require(isKnownRoot(t.root), "unknown root");
        require(!spentNullifiers[t.nullifier], "nullifier spent");
        require(t.withdrawAmount == 0 || ext.recipient != address(0), "no recipient");
        require(t.fee == 0 || ext.feeRecipient != address(0), "no fee recipient");
        if (t.depositAmount > 0 || t.withdrawAmount > 0 || t.fee > 0) require(assetAllowed[t.asset], "asset not allowed");
        else require(t.asset == address(0), "asset must be hidden");

        extHash = hashExtData(ext);
        uint256[N_PUBLIC] memory pub;
        pub[0] = t.root;
        pub[1] = t.nullifier;
        for (uint256 i; i < N_OUTS; i++) pub[2 + i] = t.outCommitments[i];
        pub[2 + N_OUTS] = t.depositAmount;
        pub[3 + N_OUTS] = t.withdrawAmount;
        pub[4 + N_OUTS] = t.fee;
        pub[5 + N_OUTS] = uint160(t.asset);
        pub[6 + N_OUTS] = extHash;
        pub[7 + N_OUTS] = domainTag;
        require(verifier.verifyProof(t.proof.a, t.proof.b, t.proof.c, pub), "invalid proof");

        // effects before interactions; any failed transfer reverts the whole state change
        spentNullifiers[t.nullifier] = true;
        emit NewNullifier(t.nullifier);
        uint256 first = _insert(t.outCommitments);
        for (uint256 i; i < N_OUTS; i++) {
            emit NewCommitment(t.outCommitments[i], first + i, ext.encryptedOutputs[i]);
        }
    }

    function _payOut(TxArgs calldata t, ExtData calldata ext) internal {
        if (t.withdrawAmount > 0) require(IERC20(t.asset).transfer(ext.recipient, t.withdrawAmount), "withdraw failed");
        if (t.fee > 0) require(IERC20(t.asset).transfer(ext.feeRecipient, t.fee), "fee failed");
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
