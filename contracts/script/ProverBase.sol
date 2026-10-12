// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {VeilPayVault} from "../src/VeilPayVault.sol";

interface Vm {
    struct FfiResult {
        int32 exitCode;
        bytes stdout;
        bytes stderr;
    }

    function ffi(string[] calldata) external returns (bytes memory);
    function tryFfi(string[] calldata) external returns (FfiResult memory);
    function readFile(string calldata) external view returns (string memory);
    function parseBytes(string calldata) external pure returns (bytes memory);
    function toString(uint256) external pure returns (string memory);
    function prank(address) external;
    function expectRevert(bytes calldata) external;
    function expectRevert() external;
    function envUint(string calldata) external view returns (uint256);
    function addr(uint256) external pure returns (address);
    function startBroadcast(uint256) external;
    function stopBroadcast() external;
}

/// Shared by tests and scripts: builds transaction proofs by calling prover/prove.mjs via ffi.
abstract contract ProverBase {
    uint256 constant N = 16; // outputs per transaction, matches VeilPayVault.N_OUTS
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct Note {
        uint256 secret;
        uint256 amount;
        uint256 rho;
        uint256 index;
    }

    struct Out {
        uint256 ownerSecret;
        uint256 amount;
        uint256 rho;
    }

    struct Tx {
        VeilPayVault.Proof proof;
        uint256 root;
        uint256 nullifier;
        uint256[N] commitments;
        uint64 dep;
        uint64 wd;
        uint64 fee;
        VeilPayVault.ExtData ext;
    }

    VeilPayVault vault;
    uint256[] leaves;

    function _ext(address recipient, address feeRecipient) internal pure returns (VeilPayVault.ExtData memory e) {
        e.recipient = recipient;
        e.feeRecipient = feeRecipient;
        for (uint256 i; i < N; i++) e.encryptedOutputs[i] = abi.encodePacked("ciphertext-", uint8(i));
    }

    /// `outs` holds the real outputs (at most N); the rest are padded with zero-value placeholders.
    function _prove(Note memory n, Out[] memory outs, uint64 dep, uint64 wd, uint64 fee, VeilPayVault.ExtData memory ext)
        internal
        returns (Tx memory t)
    {
        // abi.decode needs a literal length: 26 = 10 proof/root/nullifier words + N commitments
        uint256[26] memory w = abi.decode(vm.ffi(_proveCmd(n, outs, dep, wd, fee, ext)), (uint256[26]));
        require(w.length == 10 + N, "prover word count");
        t.proof.a = [w[0], w[1]];
        t.proof.b = [[w[2], w[3]], [w[4], w[5]]];
        t.proof.c = [w[6], w[7]];
        t.root = w[8];
        t.nullifier = w[9];
        for (uint256 i; i < N; i++) t.commitments[i] = w[10 + i];
        t.dep = dep;
        t.wd = wd;
        t.fee = fee;
        t.ext = ext;
    }

    function _proveCmd(Note memory n, Out[] memory outs, uint64 dep, uint64 wd, uint64 fee, VeilPayVault.ExtData memory ext)
        internal
        view
        returns (string[] memory cmd)
    {
        string memory ls;
        for (uint256 i; i < leaves.length; i++) ls = string.concat(ls, i == 0 ? "" : ",", _q(leaves[i]));
        string memory os;
        require(outs.length <= N, "too many outputs");
        for (uint256 i; i < N; i++) {
            Out memory o = i < outs.length ? outs[i] : Out(0x5eed, 0, 1000 + i);
            os = string.concat(os, i == 0 ? "" : ",",
                '{"ownerSecret":', _q(o.ownerSecret), ',"amount":', _q(o.amount), ',"rho":', _q(o.rho), "}");
        }
        string memory head = string.concat(
            '{"domainTag":', _q(vault.domainTag()),
            ',"extDataHash":', _q(vault.hashExtData(ext)),
            ',"depositAmount":', _q(dep), ',"withdrawAmount":', _q(wd), ',"fee":', _q(fee)
        );
        string memory inNote = string.concat(
            '{"spendSecret":', _q(n.secret), ',"amount":', _q(n.amount), ',"rho":', _q(n.rho), ',"index":', _q(n.index), "}"
        );
        string memory json = string.concat(head, ',"leaves":[', ls, '],"in":', inNote, ',"outs":[', os, "]}");
        cmd = new string[](3);
        cmd[0] = "node";
        cmd[1] = "../prover/prove.mjs";
        cmd[2] = json;
    }

    function _q(uint256 x) internal pure returns (string memory) {
        return string.concat('"', vm.toString(x), '"');
    }
}
