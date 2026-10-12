// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {VeilPayVault, IERC20, IPoseidon2, ITransactionVerifier} from "../src/VeilPayVault.sol";
import {TransactionVerifier} from "../src/TransactionVerifier.sol";
import {ProverBase} from "./ProverBase.sol";

/// forge script script/Deploy.s.sol --rpc-url <arc rpc> --broadcast
/// The USDC flow runs via prover/testnet_flow.mjs: forge's local simulation cannot execute Arc USDC precompiles.
contract Deploy is ProverBase {
    IERC20 constant ARC_USDC = IERC20(0x3600000000000000000000000000000000000000);

    uint256 key;

    function run() external returns (VeilPayVault) {
        require(block.chainid == 5042002 || block.chainid == 5042, "not Arc");
        key = vm.envUint("PRIVATE_KEY");
        bytes memory code = vm.parseBytes(vm.readFile("../build/poseidon2.hex"));

        vm.startBroadcast(key);
        address h;
        assembly { h := create(0, add(code, 0x20), mload(code)) }
        require(h != address(0), "hasher deploy");
        ITransactionVerifier verifier = ITransactionVerifier(address(new TransactionVerifier()));
        vault = new VeilPayVault(ARC_USDC, IPoseidon2(h), verifier);
        vm.stopBroadcast();
        return vault;
    }
}
