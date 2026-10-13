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
    function envOr(string calldata, address) external view returns (address);
    function addr(uint256) external pure returns (address);
    function sign(uint256, bytes32) external pure returns (uint8, bytes32, bytes32);
    function etch(address, bytes calldata) external;
    function chainId(uint256) external;
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
        VeilPayVault.TxArgs args;
        VeilPayVault.ExtData ext;
    }

    VeilPayVault vault;
    uint256[] leaves;

    function _ext(address recipient, address feeRecipient) internal pure returns (VeilPayVault.ExtData memory e) {
        e.recipient = recipient;
        e.feeRecipient = feeRecipient;
        for (uint256 i; i < N; i++) e.encryptedOutputs[i] = abi.encodePacked("ciphertext-", uint8(i));
    }

    /// Public asset as the vault expects it: the notes' asset when value moves, otherwise hidden (zero).
    function _publicAsset(address noteAsset, uint64 dep, uint64 wd, uint64 fee) internal pure returns (address) {
        return dep > 0 || wd > 0 || fee > 0 ? noteAsset : address(0);
    }

    /// `outs` holds the real outputs (at most N); the rest are padded with zero-value placeholders. All notes are `asset`.
    function _prove(Note memory n, address asset, Out[] memory outs, uint64 dep, uint64 wd, uint64 fee, VeilPayVault.ExtData memory ext)
        internal
        returns (Tx memory t)
    {
        address pubAsset = _publicAsset(asset, dep, wd, fee);
        // abi.decode needs a literal length: 26 = 10 proof/root/nullifier words + N commitments
        uint256[26] memory w = abi.decode(vm.ffi(_proveCmd(n, asset, pubAsset, outs, dep, wd, fee, ext)), (uint256[26]));
        require(w.length == 10 + N, "prover word count");
        t.args.proof.a = [w[0], w[1]];
        t.args.proof.b = [[w[2], w[3]], [w[4], w[5]]];
        t.args.proof.c = [w[6], w[7]];
        t.args.root = w[8];
        t.args.nullifier = w[9];
        for (uint256 i; i < N; i++) t.args.outCommitments[i] = w[10 + i];
        t.args.asset = pubAsset;
        t.args.depositAmount = dep;
        t.args.withdrawAmount = wd;
        t.args.fee = fee;
        t.ext = ext;
    }

    function _proveCmd(
        Note memory n,
        address noteAsset,
        address pubAsset,
        Out[] memory outs,
        uint64 dep,
        uint64 wd,
        uint64 fee,
        VeilPayVault.ExtData memory ext
    ) internal view returns (string[] memory cmd) {
        string memory head = string.concat(
            _head(dep, wd, fee, ext), ',"asset":', _q(uint160(pubAsset)), ',"noteAsset":', _q(uint160(noteAsset))
        );
        cmd = new string[](3);
        cmd[0] = "node";
        cmd[1] = "../prover/prove.mjs";
        cmd[2] = string.concat(head, ',"leaves":[', _leavesJson(), '],"in":', _noteJson(n), ',"outs":[', _outsJson(outs), "]}");
    }

    function _leavesJson() internal view returns (string memory ls) {
        for (uint256 i; i < leaves.length; i++) ls = string.concat(ls, i == 0 ? "" : ",", _q(leaves[i]));
    }

    function _outsJson(Out[] memory outs) internal pure returns (string memory os) {
        require(outs.length <= N, "too many outputs");
        for (uint256 i; i < N; i++) {
            Out memory o = i < outs.length ? outs[i] : Out(0x5eed, 0, 1000 + i);
            os = string.concat(os, i == 0 ? "" : ",",
                '{"ownerSecret":', _q(o.ownerSecret), ',"amount":', _q(o.amount), ',"rho":', _q(o.rho), "}");
        }
    }

    function _noteJson(Note memory n) internal pure returns (string memory) {
        return string.concat(
            '{"spendSecret":', _q(n.secret), ',"amount":', _q(n.amount), ',"rho":', _q(n.rho), ',"index":', _q(n.index), "}"
        );
    }

    function _head(uint64 dep, uint64 wd, uint64 fee, VeilPayVault.ExtData memory ext) internal view returns (string memory) {
        return string.concat(
            '{"domainTag":', _q(vault.domainTag()),
            ',"extDataHash":', _q(vault.hashExtData(ext)),
            ',"depositAmount":', _q(dep), ',"withdrawAmount":', _q(wd), ',"fee":', _q(fee)
        );
    }

    function _q(uint256 x) internal pure returns (string memory) {
        return string.concat('"', vm.toString(x), '"');
    }
}
