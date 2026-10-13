// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {VeilPayVault, IPoseidon2, ITransactionVerifier, IPermit2} from "../src/VeilPayVault.sol";
import {TransactionVerifier} from "../src/TransactionVerifier.sol";
import {ProverBase} from "./ProverBase.sol";

/// forge script script/Deploy.s.sol --rpc-url <arc rpc> --broadcast
/// The USDC flow runs via prover/testnet_flow.mjs: forge's local simulation cannot execute Arc USDC precompiles.
contract Deploy is ProverBase {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address constant EURC_TESTNET = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address constant EURC_MAINNET = 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1;
    IPermit2 constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);

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
        address[] memory assets = new address[](2);
        assets[0] = ARC_USDC;
        assets[1] = block.chainid == 5042002 ? EURC_TESTNET : EURC_MAINNET;
        vault = new VeilPayVault(assets, IPoseidon2(h), verifier, PERMIT2);
        vm.stopBroadcast();
        return vault;
    }
}
