// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {VeilPayVault, IERC20, IPoseidon2, ITransactionVerifier, IPermit2} from "../src/VeilPayVault.sol";
import {TransactionVerifier} from "../src/TransactionVerifier.sol";
import {ProverBase, Vm} from "../script/ProverBase.sol";

contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public blocked;

    // EIP-3009 receive side, mirroring Circle FiatToken checks
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public immutable DOMAIN_SEPARATOR;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("Mock"), keccak256("2"), block.chainid, address(this)
        ));
    }

    function receiveWithAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        require(to == msg.sender, "caller must be the payee");
        require(block.timestamp > validAfter && block.timestamp < validBefore, "authorization not valid now");
        require(!authorizationState[from][nonce], "authorization used");
        bytes32 structHash = keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        require(ecrecover(keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)), v, r, s) == from, "invalid signature");
        authorizationState[from][nonce] = true;
        _move(from, to, value);
    }

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

interface IPermit2Domain {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

contract VeilPayVaultTest is ProverBase {
    uint64 constant UNIT = 1e6;
    uint256 constant EMPLOYER = 0x1111;
    uint256 constant ALICE = 0xa11ce;
    uint256 constant BOB = 0xb0b;
    uint256 constant CAROL = 0xca201;
    uint256 constant EMPLOYER_KEY = 0xE1E1;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    address employerWallet;
    address bobWallet = address(0xB0B0);
    address relayer = address(0x7E1A);

    MockToken usdc;
    MockToken eurc;
    IPoseidon2 hasher;
    ITransactionVerifier verifier;

    function setUp() public {
        vm.chainId(5042002);
        vm.etch(PERMIT2, vm.parseBytes(vm.readFile("test/fixtures/permit2.hex")));
        employerWallet = vm.addr(EMPLOYER_KEY);
        usdc = new MockToken();
        eurc = new MockToken();
        bytes memory code = vm.parseBytes(vm.readFile("../build/poseidon2.hex"));
        address h;
        assembly { h := create(0, add(code, 0x20), mload(code)) }
        require(h != address(0), "hasher deploy");
        hasher = IPoseidon2(h);
        verifier = ITransactionVerifier(address(new TransactionVerifier()));
        vault = _newVault();

        MockToken[2] memory tokens = [usdc, eurc];
        for (uint256 i; i < 2; i++) {
            tokens[i].mint(employerWallet, 100_000 * UNIT);
            vm.prank(employerWallet);
            tokens[i].approve(address(vault), type(uint256).max);
            vm.prank(employerWallet);
            tokens[i].approve(PERMIT2, type(uint256).max);
        }
    }

    function _newVault() internal returns (VeilPayVault) {
        address[] memory assets = new address[](2);
        assets[0] = address(usdc);
        assets[1] = address(eurc);
        return new VeilPayVault(assets, hasher, verifier, IPermit2(PERMIT2));
    }

    // ---------- single-asset scenarios ----------

    function test_depositPayrollWithdraw() public {
        _depositAndPay(usdc);
        require(usdc.balanceOf(address(vault)) == 10_000 * UNIT, "vault after payroll");

        Tx memory t = _bobWithdraw(usdc);
        _submit(t, relayer);

        require(usdc.balanceOf(bobWallet) == 1_500 * UNIT, "bob received");
        require(usdc.balanceOf(relayer) == 10 * UNIT, "relayer fee");
        require(usdc.balanceOf(address(vault)) == 8_490 * UNIT, "vault after withdraw");
        require(vault.nextIndex() == 3 * N, "leaf count");
    }

    function test_fullBatchPaysFifteenInOneTransaction() public {
        _deposit(usdc, 16_000 * UNIT);
        Out[] memory outs = new Out[](N);
        for (uint256 i; i < N - 1; i++) outs[i] = Out(0xe000 + i, (1_000 + uint64(i)) * UNIT, 100 + i); // 1,000..1,014
        outs[N - 1] = Out(EMPLOYER, 16_000 * UNIT - (15_000 + 105) * UNIT, 999); // change: 895
        Tx memory t = _prove(Note(EMPLOYER, 16_000 * UNIT, 1, 0), address(usdc), outs, 0, 0, 0, _ext(address(0), address(0)));
        _submit(t, employerWallet);
        require(vault.nextIndex() == 2 * N, "two full subtrees");
        require(usdc.balanceOf(address(vault)) == 16_000 * UNIT, "payroll moves no public funds");
    }

    function test_fullBatchCannotOverpay() public {
        _deposit(usdc, 16_000 * UNIT);
        Out[] memory outs = new Out[](N);
        for (uint256 i; i < N; i++) outs[i] = Out(0xe000 + i, 1_001 * UNIT, 100 + i); // 16,016 > 16,000
        Vm.FfiResult memory r = vm.tryFfi(
            _proveCmd(Note(EMPLOYER, 16_000 * UNIT, 1, 0), address(usdc), address(0), outs, 0, 0, 0, _ext(address(0), address(0)))
        );
        require(r.exitCode != 0, "overpaying proof must not be generated");
    }

    function test_doubleSpendRejected() public {
        _depositAndPay(usdc);
        Tx memory t = _bobWithdraw(usdc);
        _submit(t, address(this));
        vm.expectRevert(bytes("nullifier spent"));
        _submitRaw(t);
    }

    function test_relayerCannotChangeRecipient() public {
        _depositAndPay(usdc);
        Tx memory t = _bobWithdraw(usdc);
        t.ext.recipient = relayer;
        vm.expectRevert(bytes("invalid proof"));
        _submitRaw(t);
    }

    function test_relayerCannotChangeFeeOrCiphertext() public {
        _depositAndPay(usdc);
        Tx memory t = _bobWithdraw(usdc);
        t.args.fee = 11 * UNIT;
        vm.expectRevert(bytes("invalid proof"));
        _submitRaw(t);

        t.args.fee = 10 * UNIT;
        t.ext.encryptedOutputs[0] = "swapped";
        vm.expectRevert(bytes("invalid proof"));
        _submitRaw(t);
    }

    function test_withdrawAmountTamperRejected() public {
        _depositAndPay(usdc);
        Tx memory t = _bobWithdraw(usdc);
        t.args.withdrawAmount = 3_000 * UNIT;
        vm.expectRevert(bytes("invalid proof"));
        _submitRaw(t);
    }

    function test_crossVaultReplayRejected() public {
        VeilPayVault other = _newVault();
        require(other.currentRoot() == vault.currentRoot(), "same empty root");
        require(other.domainTag() != vault.domainTag(), "distinct domain");

        Tx memory t = _depositTx(usdc, 500 * UNIT);
        vm.prank(employerWallet);
        usdc.approve(address(other), type(uint256).max);
        vm.prank(employerWallet);
        vm.expectRevert(bytes("invalid proof"));
        other.transact(t.args, t.ext);
    }

    function test_unknownRootRejected() public {
        _depositAndPay(usdc);
        Tx memory t = _bobWithdraw(usdc);
        t.args.root = t.args.root + 1;
        vm.expectRevert(bytes("unknown root"));
        _submitRaw(t);
    }

    function test_blockedRecipientRevertsAtomically() public {
        _depositAndPay(usdc);
        Tx memory t = _bobWithdraw(usdc);
        uint256 indexBefore = vault.nextIndex();
        usdc.setBlocked(bobWallet, true);
        vm.expectRevert(bytes("blocked"));
        _submitRaw(t);
        require(!vault.spentNullifiers(t.args.nullifier), "nullifier must stay unspent");
        require(vault.nextIndex() == indexBefore, "tree must be unchanged");

        usdc.setBlocked(bobWallet, false);
        _submit(t, address(this));
        require(usdc.balanceOf(bobWallet) == 1_500 * UNIT, "retry succeeds");
    }

    function test_depositWithoutFundsReverts() public {
        Tx memory t = _depositTx(usdc, 500 * UNIT);
        vm.prank(bobWallet); // no balance, no allowance
        vm.expectRevert();
        vault.transact(t.args, t.ext);
        require(!vault.spentNullifiers(t.args.nullifier), "nullifier must stay unspent");
        require(usdc.balanceOf(address(vault)) == 0, "no funds moved");
    }

    function test_cannotProveInflation() public {
        _deposit(usdc, 1_000 * UNIT);
        Out[] memory outs = new Out[](1);
        outs[0] = Out(ALICE, 1_001 * UNIT, 7);
        Vm.FfiResult memory r = vm.tryFfi(
            _proveCmd(Note(EMPLOYER, 1_000 * UNIT, 1, 0), address(usdc), address(0), outs, 0, 0, 0, _ext(address(0), address(0)))
        );
        require(r.exitCode != 0, "inflating proof must not be generated");
    }

    function test_cannotSpendOthersNote() public {
        _deposit(usdc, 1_000 * UNIT);
        Out[] memory outs = new Out[](1);
        outs[0] = Out(BOB, 1_000 * UNIT, 7);
        // right note contents, wrong spend secret
        Vm.FfiResult memory r = vm.tryFfi(
            _proveCmd(Note(BOB, 1_000 * UNIT, 1, 0), address(usdc), address(0), outs, 0, 0, 0, _ext(address(0), address(0)))
        );
        require(r.exitCode != 0, "proof without owner secret must not be generated");
    }

    // ---------- multiple assets ----------

    function test_assetsAreSeparateLedgers() public {
        _deposit(usdc, 10_000 * UNIT); // leaves 0..15
        _deposit(eurc, 10_000 * UNIT); // leaves 16..31
        Out[] memory outs = new Out[](4);
        outs[0] = Out(ALICE, 2_000 * UNIT, 11);
        outs[1] = Out(BOB, 3_000 * UNIT, 12);
        outs[2] = Out(CAROL, 4_000 * UNIT, 13);
        outs[3] = Out(EMPLOYER, 1_000 * UNIT, 14);
        Tx memory pay = _prove(Note(EMPLOYER, 10_000 * UNIT, 1, N), address(eurc), outs, 0, 0, 0, _ext(address(0), address(0)));
        require(pay.args.asset == address(0), "payroll hides its asset");
        _submit(pay, employerWallet);

        Out[] memory change = new Out[](1);
        change[0] = Out(BOB, 1_490 * UNIT, 21);
        Tx memory wd = _prove(Note(BOB, 3_000 * UNIT, 12, 2 * N + 1), address(eurc), change, 0, 1_500 * UNIT, 10 * UNIT, _ext(bobWallet, relayer));
        _submit(wd, relayer);

        require(eurc.balanceOf(bobWallet) == 1_500 * UNIT && usdc.balanceOf(bobWallet) == 0, "bob paid in EURC only");
        require(eurc.balanceOf(relayer) == 10 * UNIT, "fee in the note's asset");
        require(eurc.balanceOf(address(vault)) == 8_490 * UNIT, "EURC ledger");
        require(usdc.balanceOf(address(vault)) == 10_000 * UNIT, "USDC ledger untouched");
    }

    function test_cannotWithdrawNoteAsOtherAsset() public {
        _depositAndPay(eurc);
        Tx memory t = _bobWithdraw(eurc);
        t.args.asset = address(usdc); // claim the EURC note is USDC
        vm.expectRevert(bytes("invalid proof"));
        _submitRaw(t);

        // and the circuit refuses a public asset that differs from the notes' asset
        Out[] memory outs = new Out[](1);
        outs[0] = Out(BOB, 1_490 * UNIT, 21);
        Vm.FfiResult memory r = vm.tryFfi(
            _proveCmd(Note(BOB, 3_000 * UNIT, 12, N + 1), address(eurc), address(usdc), outs, 0, 1_500 * UNIT, 10 * UNIT, _ext(bobWallet, relayer))
        );
        require(r.exitCode != 0, "mismatched public asset must not be provable");
    }

    function test_unlistedAssetRejected() public {
        MockToken other = new MockToken();
        other.mint(employerWallet, 1_000 * UNIT);
        vm.prank(employerWallet);
        other.approve(address(vault), type(uint256).max);
        Tx memory t = _depositTx(other, 500 * UNIT);
        vm.prank(employerWallet);
        vm.expectRevert(bytes("asset not allowed"));
        vault.transact(t.args, t.ext);
    }

    function test_internalTransferMustHideAsset() public {
        _deposit(usdc, 1_000 * UNIT);
        Out[] memory outs = new Out[](1);
        outs[0] = Out(ALICE, 1_000 * UNIT, 7);
        Tx memory t = _prove(Note(EMPLOYER, 1_000 * UNIT, 1, 0), address(usdc), outs, 0, 0, 0, _ext(address(0), address(0)));
        t.args.asset = address(usdc);
        vm.expectRevert(bytes("asset must be hidden"));
        _submitRaw(t);
    }

    function test_addAssetIsOwnerOnlyAndAddOnly() public {
        MockToken other = new MockToken();
        vm.prank(bobWallet);
        vm.expectRevert(bytes("not owner"));
        vault.addAsset(address(other));
        vm.expectRevert(bytes("asset exists"));
        vault.addAsset(address(usdc));
        vm.expectRevert(bytes("zero asset"));
        vault.addAsset(address(0));

        vault.addAsset(address(other)); // this test contract deployed the vault
        require(vault.assetAllowed(address(other)), "added");
        other.mint(employerWallet, 1_000 * UNIT);
        vm.prank(employerWallet);
        other.approve(address(vault), type(uint256).max);
        _deposit(other, 500 * UNIT);
        require(other.balanceOf(address(vault)) == 500 * UNIT, "new asset deposits work");
    }

    // ---------- Permit2 deposits ----------

    function test_permit2DepositSubmittedByRelayer() public {
        Tx memory t = _permitDepositTx(eurc, 1_000 * UNIT, 10 * UNIT, 0xAA);
        VeilPayVault.Permit2Deposit memory p = _signPermit(t, 7);
        vm.prank(relayer);
        vault.transactWithPermit2(t.args, t.ext, p);
        for (uint256 i; i < N; i++) leaves.push(t.args.outCommitments[i]);

        require(eurc.balanceOf(address(vault)) == 990 * UNIT, "vault holds deposit minus fee");
        require(eurc.balanceOf(relayer) == 10 * UNIT, "relayer paid in EURC");
        require(eurc.balanceOf(employerWallet) == 99_000 * UNIT, "pulled from the signer");
    }

    function test_permit2WitnessBindsOutputs() public {
        Tx memory signed = _permitDepositTx(usdc, 1_000 * UNIT, 0, 0xAA);
        VeilPayVault.Permit2Deposit memory p = _signPermit(signed, 8);
        // a front-runner reuses the signature with its own outputs
        Tx memory stolen = _permitDepositTx(usdc, 1_000 * UNIT, 0, 0xBAD);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSignature("InvalidSigner()"));
        vault.transactWithPermit2(stolen.args, stolen.ext, p);

        vm.prank(relayer);
        vault.transactWithPermit2(signed.args, signed.ext, p);
        require(usdc.balanceOf(address(vault)) == 1_000 * UNIT, "honest submission works");
    }

    function test_permit2RequiresDeposit() public {
        _deposit(usdc, 1_000 * UNIT);
        Out[] memory outs = new Out[](1);
        outs[0] = Out(ALICE, 1_000 * UNIT, 7);
        Tx memory t = _prove(Note(EMPLOYER, 1_000 * UNIT, 1, 0), address(usdc), outs, 0, 0, 0, _ext(address(0), address(0)));
        VeilPayVault.Permit2Deposit memory p;
        vm.expectRevert(bytes("no deposit"));
        vault.transactWithPermit2(t.args, t.ext, p);
    }

    // ---------- EIP-3009 deposits ----------

    function test_eip3009DepositNeedsNoApproval() public {
        uint256 key = 0xF5E5;
        address fresh = vm.addr(key);
        eurc.mint(fresh, 1_000 * UNIT); // no approve to the vault or Permit2
        Tx memory t = _permitDepositTx(eurc, 1_000 * UNIT, 10 * UNIT, 0xAA);
        VeilPayVault.Authorization memory a = _signAuthorization(eurc, key, t);
        vm.prank(relayer);
        vault.transactWithAuthorization(t.args, t.ext, a);

        require(eurc.balanceOf(fresh) == 0, "pulled from the signer");
        require(eurc.balanceOf(address(vault)) == 990 * UNIT, "vault holds deposit minus fee");
        require(eurc.balanceOf(relayer) == 10 * UNIT, "relayer fee");
        require(eurc.allowance(fresh, address(vault)) == 0 && eurc.allowance(fresh, PERMIT2) == 0, "no allowance involved");
    }

    function test_eip3009NonceBindsOutputs() public {
        Tx memory signed = _permitDepositTx(usdc, 1_000 * UNIT, 0, 0xAA);
        VeilPayVault.Authorization memory a = _signAuthorization(usdc, EMPLOYER_KEY, signed);
        Tx memory stolen = _permitDepositTx(usdc, 1_000 * UNIT, 0, 0xBAD);
        vm.prank(relayer);
        vm.expectRevert(bytes("invalid signature"));
        vault.transactWithAuthorization(stolen.args, stolen.ext, a);

        vm.prank(relayer);
        vault.transactWithAuthorization(signed.args, signed.ext, a);
        require(usdc.balanceOf(address(vault)) == 1_000 * UNIT, "honest submission works");
    }

    function test_eip3009AuthorizationIsSingleUse() public {
        Tx memory first = _permitDepositTx(usdc, 1_000 * UNIT, 0, 0xAA);
        VeilPayVault.Authorization memory a = _signAuthorization(usdc, EMPLOYER_KEY, first);
        vault.transactWithAuthorization(first.args, first.ext, a);
        for (uint256 i; i < N; i++) leaves.push(first.args.outCommitments[i]);

        // same outputs and ext data (so the same nonce) under a fresh nullifier
        Out[] memory outs = new Out[](1);
        outs[0] = Out(0xAA, 1_000 * UNIT, 1);
        Tx memory again = _prove(Note(0xd0d1, 0, 0, 0), address(usdc), outs, 1_000 * UNIT, 0, 0, _ext(address(0), address(0)));
        require(vault.depositWitness(again.args.outCommitments, vault.hashExtData(again.ext))
            == vault.depositWitness(first.args.outCommitments, vault.hashExtData(first.ext)), "same nonce");
        vm.expectRevert(bytes("authorization used"));
        vault.transactWithAuthorization(again.args, again.ext, a);
        require(usdc.balanceOf(address(vault)) == 1_000 * UNIT, "funded once");
    }

    function test_eip3009RequiresDeposit() public {
        _deposit(usdc, 1_000 * UNIT);
        Out[] memory outs = new Out[](1);
        outs[0] = Out(ALICE, 1_000 * UNIT, 7);
        Tx memory t = _prove(Note(EMPLOYER, 1_000 * UNIT, 1, 0), address(usdc), outs, 0, 0, 0, _ext(address(0), address(0)));
        VeilPayVault.Authorization memory a;
        vm.expectRevert(bytes("no deposit"));
        vault.transactWithAuthorization(t.args, t.ext, a);
    }

    // ---------- flows ----------

    /// Employer deposits 10,000 then splits it: Alice 2,000, Bob 3,000, Carol 4,000, change 1,000.
    function _depositAndPay(MockToken token) internal {
        _deposit(token, 10_000 * UNIT);
        Out[] memory outs = new Out[](4);
        outs[0] = Out(ALICE, 2_000 * UNIT, 11);
        outs[1] = Out(BOB, 3_000 * UNIT, 12);
        outs[2] = Out(CAROL, 4_000 * UNIT, 13);
        outs[3] = Out(EMPLOYER, 1_000 * UNIT, 14);
        Tx memory t = _prove(Note(EMPLOYER, 10_000 * UNIT, 1, 0), address(token), outs, 0, 0, 0, _ext(address(0), address(0)));
        _submit(t, employerWallet);
    }

    /// Bob spends his 3,000 note (leaf N + 1: second output of the payroll tx): 1,500 to his wallet, 10 relayer fee, 1,490 change.
    function _bobWithdraw(MockToken token) internal returns (Tx memory) {
        Out[] memory outs = new Out[](1);
        outs[0] = Out(BOB, 1_490 * UNIT, 21);
        return _prove(Note(BOB, 3_000 * UNIT, 12, N + 1), address(token), outs, 0, 1_500 * UNIT, 10 * UNIT, _ext(bobWallet, relayer));
    }

    function _deposit(MockToken token, uint64 amount) internal {
        _submit(_depositTx(token, amount), employerWallet);
    }

    function _depositTx(MockToken token, uint64 amount) internal returns (Tx memory) {
        Out[] memory outs = new Out[](1);
        outs[0] = Out(EMPLOYER, amount, 1);
        return _prove(Note(0xd0d0, 0, 0, 0), address(token), outs, amount, 0, 0, _ext(address(0), address(0)));
    }

    /// Deposit of `amount` paying `fee` to the relayer; `owner` picks the output owner so two txs differ.
    function _permitDepositTx(MockToken token, uint64 amount, uint64 fee, uint256 owner) internal returns (Tx memory) {
        Out[] memory outs = new Out[](1);
        outs[0] = Out(owner, amount - fee, 1);
        return _prove(Note(0xd0d0, 0, 0, 0), address(token), outs, amount, 0, fee, _ext(address(0), fee > 0 ? relayer : address(0)));
    }

    /// Employer's Permit2 PermitWitnessTransferFrom signature over this deposit, spender = vault.
    function _signPermit(Tx memory t, uint256 nonce) internal view returns (VeilPayVault.Permit2Deposit memory p) {
        p.owner = employerWallet;
        p.nonce = nonce;
        p.deadline = block.timestamp + 1 hours;
        bytes32 witness = vault.depositWitness(t.args.outCommitments, vault.hashExtData(t.ext));
        bytes32 typeHash = keccak256(abi.encodePacked(
            "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,",
            vault.DEPOSIT_WITNESS_TYPE()
        ));
        bytes32 tokenPerms = keccak256(abi.encode(
            keccak256("TokenPermissions(address token,uint256 amount)"), t.args.asset, uint256(t.args.depositAmount)
        ));
        bytes32 structHash = keccak256(abi.encode(typeHash, tokenPerms, address(vault), p.nonce, p.deadline, witness));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", IPermit2Domain(PERMIT2).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(EMPLOYER_KEY, digest);
        p.signature = abi.encodePacked(r, s, v);
    }

    /// `key`'s EIP-3009 ReceiveWithAuthorization for this deposit; nonce = the vault's deposit witness.
    function _signAuthorization(MockToken token, uint256 key, Tx memory t) internal view returns (VeilPayVault.Authorization memory a) {
        a.from = vm.addr(key);
        a.validAfter = 0;
        a.validBefore = block.timestamp + 1 hours;
        bytes32 nonce = vault.depositWitness(t.args.outCommitments, vault.hashExtData(t.ext));
        bytes32 structHash = keccak256(abi.encode(
            token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), a.from, address(vault), uint256(t.args.depositAmount), a.validAfter, a.validBefore, nonce
        ));
        (a.v, a.r, a.s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash)));
    }

    // ---------- helpers ----------

    function _submit(Tx memory t, address sender) internal {
        require(t.args.root == vault.currentRoot(), "prover root != vault root");
        vm.prank(sender);
        _submitRaw(t);
        for (uint256 i; i < N; i++) leaves.push(t.args.outCommitments[i]);
    }

    function _submitRaw(Tx memory t) internal {
        vault.transact(t.args, t.ext);
    }
}
