// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";
import "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title  PayrollToken
 * @notice A confidential fungible token (ERC-7984 pattern) for on-chain payroll payments.
 *         Balances are encrypted using fhEVM (FHE). Only the holder (and approved operators)
 *         can decrypt their own balance.
 */
contract PayrollToken is ZamaEthereumConfig {
    string public name;
    string public symbol;
    uint8 public constant decimals = 6;

    uint64 private _totalSupply;
    address public owner;

    mapping(address => euint64) internal _balances;
    mapping(address => mapping(address => bool)) internal _operators;
    mapping(address => mapping(address => uint48)) internal _operatorExpiry;

    event ConfidentialTransfer(address indexed from, address indexed to);
    event OperatorSet(
        address indexed holder,
        address indexed operator,
        uint48 until
    );
    event Mint(address indexed to, uint64 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
    }

    function totalSupply() public view returns (uint64) {
        return _totalSupply;
    }

    function confidentialBalanceOf(
        address account
    ) public view returns (euint64) {
        return _balances[account];
    }

    /// @notice Mint tokens to an address (owner only, plaintext amount for simplicity).
    function mint(address to, uint64 amount) public onlyOwner {
        _totalSupply += amount;
        euint64 encAmount = FHE.asEuint64(amount);
        euint64 newBalance = FHE.add(_balances[to], encAmount);
        _balances[to] = newBalance;
        FHE.allowThis(newBalance);
        FHE.allow(newBalance, to);
        emit Mint(to, amount);
    }

    /// @notice Set an operator that can transfer on behalf of the caller (ERC-7984 pattern).
    /// @param operator  The address to authorize.
    /// @param until     Unix timestamp until which the operator is valid (0 to revoke).
    function setOperator(address operator, uint48 until) external {
        _operators[msg.sender][operator] = until > 0;
        _operatorExpiry[msg.sender][operator] = until;
        emit OperatorSet(msg.sender, operator, until);
    }

    /// @notice Check whether `operator` is currently authorized to act on behalf of `holder`.
    function isOperator(
        address holder,
        address operator
    ) public view returns (bool) {
        return
            _operators[holder][operator] &&
            _operatorExpiry[holder][operator] > block.timestamp;
    }

    /// @notice Transfer an already-encrypted amount (caller must be allowed for `amount`).
    function confidentialTransfer(
        address to,
        euint64 amount
    ) public returns (bool) {
        require(FHE.isSenderAllowed(amount), "Sender not allowed");
        _transfer(msg.sender, to, amount);
        return true;
    }

    /// @notice Transfer using an encrypted input handle and proof.
    function confidentialTransfer(
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) public returns (bool) {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        _transfer(msg.sender, to, amount);
        return true;
    }

    /// @notice Transfer from `from` to `to` (operator pattern).
    function confidentialTransferFrom(
        address from,
        address to,
        euint64 amount
    ) public returns (bool) {
        require(
            msg.sender == from || isOperator(from, msg.sender),
            "Not authorized"
        );
        _transfer(from, to, amount);
        return true;
    }

    // -----------------------------------------------------------------------
    //  Internal
    // -----------------------------------------------------------------------

    function _transfer(address from, address to, euint64 amount) internal {
        // Clamp transfer to available balance (no revert on insufficient funds,
        // just transfers 0 in that case -- standard fhEVM pattern).
        ebool sufficient = FHE.le(amount, _balances[from]);
        euint64 transferValue = FHE.select(
            sufficient,
            amount,
            FHE.asEuint64(uint64(0))
        );

        euint64 newBalanceFrom = FHE.sub(_balances[from], transferValue);
        _balances[from] = newBalanceFrom;
        FHE.allowThis(newBalanceFrom);
        FHE.allow(newBalanceFrom, from);

        euint64 newBalanceTo = FHE.add(_balances[to], transferValue);
        _balances[to] = newBalanceTo;
        FHE.allowThis(newBalanceTo);
        FHE.allow(newBalanceTo, to);

        emit ConfidentialTransfer(from, to);
    }
}
