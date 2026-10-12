// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {VeilPayVault, IERC20, IPoseidon2, ITransactionVerifier} from "../src/VeilPayVault.sol";
import {TransactionVerifier} from "../src/TransactionVerifier.sol";
import {ProverBase, Vm} from "../script/ProverBase.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public blocked;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function setBlocked(address who, bool b) external { blocked[who] = b; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _move(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        return _move(from, to, amount);
    }

    function _move(address from, address to, uint256 amount) internal returns (bool) {
        require(!blocked[from] && !blocked[to], "blocked");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract VeilPayVaultTest is ProverBase {
    uint64 constant USDC = 1e6;
    uint256 constant EMPLOYER = 0x1111;
    uint256 constant ALICE = 0xa11ce;
    uint256 constant BOB = 0xb0b;
    uint256 constant CAROL = 0xca201;

    address employerWallet = address(0xE0);
    address bobWallet = address(0xB0B0);
    address relayer = address(0x7E1A);

    MockUSDC usdc;
    IPoseidon2 hasher;
    ITransactionVerifier verifier;

    function setUp() public {
        usdc = new MockUSDC();
        bytes memory code = vm.parseBytes(vm.readFile("../build/poseidon2.hex"));
        address h;
        assembly { h := create(0, add(code, 0x20), mload(code)) }
        require(h != address(0), "hasher deploy");
        hasher = IPoseidon2(h);
        verifier = ITransactionVerifier(address(new TransactionVerifier()));
        vault = new VeilPayVault(IERC20(address(usdc)), hasher, verifier);

        usdc.mint(employerWallet, 100_000 * USDC);
        vm.prank(employerWallet);
        usdc.approve(address(vault), type(uint256).max);
    }

    // ---------- scenarios ----------

    function test_depositPayrollWithdraw() public {
        _depositAndPay();
        require(usdc.balanceOf(address(vault)) == 10_000 * USDC, "vault after payroll");

        Tx memory t = _bobWithdraw();
        _submit(t, relayer);

        require(usdc.balanceOf(bobWallet) == 1_500 * USDC, "bob received");
        require(usdc.balanceOf(relayer) == 10 * USDC, "relayer fee");
        require(usdc.balanceOf(address(vault)) == 8_490 * USDC, "vault after withdraw");
        require(vault.nextIndex() == 3 * N, "leaf count");
    }

    function test_fullBatchPaysFifteenInOneTransaction() public {
        _deposit(16_000 * USDC);
        Out[] memory outs = new Out[](N);
        for (uint256 i; i < N - 1; i++) outs[i] = Out(0xe000 + i, (1_000 + uint64(i)) * USDC, 100 + i); // 1,000..1,014
        outs[N - 1] = Out(EMPLOYER, 16_000 * USDC - (15_000 + 105) * USDC, 999); // change: 895
        Tx memory t = _prove(Note(EMPLOYER, 16_000 * USDC, 1, 0), outs, 0, 0, 0, _ext(address(0), address(0)));
        _submit(t, employerWallet);
        require(vault.nextIndex() == 2 * N, "two full subtrees");
        require(usdc.balanceOf(address(vault)) == 16_000 * USDC, "payroll moves no public funds");
    }

    function test_fullBatchCannotOverpay() public {
        _deposit(16_000 * USDC);
        Out[] memory outs = new Out[](N);
        for (uint256 i; i < N; i++) outs[i] = Out(0xe000 + i, 1_001 * USDC, 100 + i); // 16,016 > 16,000
        Vm.FfiResult memory r = vm.tryFfi(_proveCmd(Note(EMPLOYER, 16_000 * USDC, 1, 0), outs, 0, 0, 0, _ext(address(0), address(0))));
        require(r.exitCode != 0, "overpaying proof must not be generated");
    }

    function test_doubleSpendRejected() public {
        _depositAndPay();
        Tx memory t = _bobWithdraw();
        _submit(t, address(this));
        vm.expectRevert(bytes("nullifier spent"));
        _submitRaw(t);
    }

    function test_relayerCannotChangeRecipient() public {
        _depositAndPay();
        Tx memory t = _bobWithdraw();
        t.ext.recipient = relayer;
        vm.expectRevert(bytes("invalid proof"));
        _submitRaw(t);
    }

    function test_relayerCannotChangeFeeOrCiphertext() public {
        _depositAndPay();
        Tx memory t = _bobWithdraw();
        t.fee = 11 * USDC;
        vm.expectRevert(bytes("invalid proof"));
        _submitRaw(t);

        t.fee = 10 * USDC;
        t.ext.encryptedOutputs[0] = "swapped";
        vm.expectRevert(bytes("invalid proof"));
        _submitRaw(t);
    }

    function test_withdrawAmountTamperRejected() public {
        _depositAndPay();
        Tx memory t = _bobWithdraw();
        t.wd = 3_000 * USDC;
        vm.expectRevert(bytes("invalid proof"));
        _submitRaw(t);
    }

    function test_crossVaultReplayRejected() public {
        VeilPayVault other = new VeilPayVault(IERC20(address(usdc)), hasher, verifier);
        require(other.currentRoot() == vault.currentRoot(), "same empty root");
        require(other.domainTag() != vault.domainTag(), "distinct domain");

        Tx memory t = _depositTx(500 * USDC);
        vm.prank(employerWallet);
        usdc.approve(address(other), type(uint256).max);
        vm.prank(employerWallet);
        vm.expectRevert(bytes("invalid proof"));
        other.transact(t.proof, t.root, t.nullifier, t.commitments, t.dep, t.wd, t.fee, t.ext);
    }

    function test_unknownRootRejected() public {
        _depositAndPay();
        Tx memory t = _bobWithdraw();
        t.root = t.root + 1;
        vm.expectRevert(bytes("unknown root"));
        _submitRaw(t);
    }

    function test_blockedRecipientRevertsAtomically() public {
        _depositAndPay();
        Tx memory t = _bobWithdraw();
        uint256 indexBefore = vault.nextIndex();
        usdc.setBlocked(bobWallet, true);
        vm.expectRevert(bytes("blocked"));
        _submitRaw(t);
        require(!vault.spentNullifiers(t.nullifier), "nullifier must stay unspent");
        require(vault.nextIndex() == indexBefore, "tree must be unchanged");

        usdc.setBlocked(bobWallet, false);
        _submit(t, address(this));
        require(usdc.balanceOf(bobWallet) == 1_500 * USDC, "retry succeeds");
    }

    function test_depositWithoutFundsReverts() public {
        Tx memory t = _depositTx(500 * USDC);
        vm.prank(bobWallet); // no balance, no allowance
        vm.expectRevert();
        vault.transact(t.proof, t.root, t.nullifier, t.commitments, t.dep, t.wd, t.fee, t.ext);
        require(!vault.spentNullifiers(t.nullifier), "nullifier must stay unspent");
        require(usdc.balanceOf(address(vault)) == 0, "no funds moved");
    }

    function test_cannotProveInflation() public {
        _deposit(1_000 * USDC);
        Out[] memory outs = new Out[](4);
        outs[0] = Out(ALICE, 1_001 * USDC, 7);
        Vm.FfiResult memory r = vm.tryFfi(_proveCmd(Note(EMPLOYER, 1_000 * USDC, 1, 0), outs, 0, 0, 0, _ext(address(0), address(0))));
        require(r.exitCode != 0, "inflating proof must not be generated");
    }

    function test_cannotSpendOthersNote() public {
        _deposit(1_000 * USDC);
        Out[] memory outs = new Out[](4);
        outs[0] = Out(BOB, 1_000 * USDC, 7);
        // right note contents, wrong spend secret
        Vm.FfiResult memory r = vm.tryFfi(_proveCmd(Note(BOB, 1_000 * USDC, 1, 0), outs, 0, 0, 0, _ext(address(0), address(0))));
        require(r.exitCode != 0, "proof without owner secret must not be generated");
    }

    // ---------- flows ----------

    /// Employer deposits 10,000 then splits it: Alice 2,000, Bob 3,000, Carol 4,000, change 1,000.
    function _depositAndPay() internal {
        _deposit(10_000 * USDC);
        Out[] memory outs = new Out[](4);
        outs[0] = Out(ALICE, 2_000 * USDC, 11);
        outs[1] = Out(BOB, 3_000 * USDC, 12);
        outs[2] = Out(CAROL, 4_000 * USDC, 13);
        outs[3] = Out(EMPLOYER, 1_000 * USDC, 14);
        Tx memory t = _prove(Note(EMPLOYER, 10_000 * USDC, 1, 0), outs, 0, 0, 0, _ext(address(0), address(0)));
        _submit(t, employerWallet);
    }

    /// Bob spends his 3,000 note (leaf N + 1: second output of the payroll tx): 1,500 to his wallet, 10 relayer fee, 1,490 change.
    function _bobWithdraw() internal returns (Tx memory) {
        Out[] memory outs = new Out[](4);
        outs[0] = Out(BOB, 1_490 * USDC, 21);
        outs[1] = Out(BOB, 0, 22);
        outs[2] = Out(BOB, 0, 23);
        outs[3] = Out(BOB, 0, 24);
        return _prove(Note(BOB, 3_000 * USDC, 12, N + 1), outs, 0, 1_500 * USDC, 10 * USDC, _ext(bobWallet, relayer));
    }

    function _deposit(uint64 amount) internal {
        Tx memory t = _depositTx(amount);
        _submit(t, employerWallet);
    }

    function _depositTx(uint64 amount) internal returns (Tx memory) {
        Out[] memory outs = new Out[](4);
        outs[0] = Out(EMPLOYER, amount, 1);
        outs[1] = Out(EMPLOYER, 0, 2);
        outs[2] = Out(EMPLOYER, 0, 3);
        outs[3] = Out(EMPLOYER, 0, 4);
        return _prove(Note(0xd0d0, 0, 0, 0), outs, amount, 0, 0, _ext(address(0), address(0)));
    }

    // ---------- helpers ----------

    function _submit(Tx memory t, address sender) internal {
        require(t.root == vault.currentRoot(), "prover root != vault root");
        vm.prank(sender);
        _submitRaw(t);
        for (uint256 i; i < N; i++) leaves.push(t.commitments[i]);
    }

    function _submitRaw(Tx memory t) internal {
        vault.transact(t.proof, t.root, t.nullifier, t.commitments, t.dep, t.wd, t.fee, t.ext);
    }

}
