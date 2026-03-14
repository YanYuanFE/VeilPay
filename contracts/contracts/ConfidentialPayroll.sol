// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";
import "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title  IPayrollToken
 * @notice Minimal interface for the confidential token used by the payroll contract.
 */
interface IPayrollToken {
    function confidentialTransferFrom(
        address from,
        address to,
        euint64 amount
    ) external returns (bool);

    function confidentialBalanceOf(
        address account
    ) external view returns (euint64);
}

/**
 * @title  ConfidentialPayroll
 * @notice VeilPay — on-chain payroll manager built on fhEVM.
 *         Employee salaries are stored as encrypted euint64 values so that only the
 *         employer and the employee themselves can view salary figures.
 *         Payroll can be executed in a single call or in batches to manage gas.
 */
contract ConfidentialPayroll is ZamaEthereumConfig {
    address public employer;
    IPayrollToken public payToken;

    struct Employee {
        bool isActive;
        euint64 encryptedSalary;
        uint256 lastPayTimestamp;
        uint256 addedAt;
    }

    mapping(address => Employee) private employees;
    address[] public employeeList;
    uint256 public activeEmployeeCount;

    event EmployeeAdded(address indexed employee, uint256 timestamp);
    event EmployeeRemoved(address indexed employee, uint256 timestamp);
    event SalaryUpdated(address indexed employee, uint256 timestamp);
    event PayrollExecuted(uint256 timestamp, uint256 employeesPaid);
    event PayrollBatchExecuted(
        uint256 timestamp,
        uint256 fromIndex,
        uint256 toIndex
    );

    modifier onlyEmployer() {
        require(msg.sender == employer, "Not employer");
        _;
    }

    constructor(address _payToken) {
        employer = msg.sender;
        payToken = IPayrollToken(_payToken);
    }

    // -----------------------------------------------------------------------
    //  Employee management
    // -----------------------------------------------------------------------

    /// @notice Add an employee with an encrypted salary (employer only).
    function addEmployee(
        address employee,
        externalEuint64 encryptedSalary,
        bytes calldata inputProof
    ) external onlyEmployer {
        require(!employees[employee].isActive, "Already active");

        euint64 salary = FHE.fromExternal(encryptedSalary, inputProof);
        FHE.allowThis(salary);
        FHE.allow(salary, employer);
        FHE.allow(salary, employee);

        employees[employee] = Employee({
            isActive: true,
            encryptedSalary: salary,
            lastPayTimestamp: 0,
            addedAt: block.timestamp
        });
        employeeList.push(employee);
        activeEmployeeCount++;

        emit EmployeeAdded(employee, block.timestamp);
    }

    /// @notice Update an employee's encrypted salary (employer only).
    function updateSalary(
        address employee,
        externalEuint64 newEncryptedSalary,
        bytes calldata inputProof
    ) external onlyEmployer {
        require(employees[employee].isActive, "Not active");

        euint64 newSalary = FHE.fromExternal(newEncryptedSalary, inputProof);
        FHE.allowThis(newSalary);
        FHE.allow(newSalary, employer);
        FHE.allow(newSalary, employee);

        employees[employee].encryptedSalary = newSalary;

        emit SalaryUpdated(employee, block.timestamp);
    }

    /// @notice Deactivate an employee (employer only).
    function removeEmployee(address employee) external onlyEmployer {
        require(employees[employee].isActive, "Not active");
        employees[employee].isActive = false;
        activeEmployeeCount--;
        emit EmployeeRemoved(employee, block.timestamp);
    }

    // -----------------------------------------------------------------------
    //  Payroll execution
    // -----------------------------------------------------------------------

    /// @notice Execute payroll for all active employees.
    function executePayroll() external onlyEmployer {
        _executePayrollBatch(0, employeeList.length);
        emit PayrollExecuted(block.timestamp, activeEmployeeCount);
    }

    /// @notice Execute payroll for a slice of the employee list (gas management).
    function executePayrollBatch(
        uint256 fromIndex,
        uint256 toIndex
    ) external onlyEmployer {
        require(toIndex <= employeeList.length, "Index out of bounds");
        _executePayrollBatch(fromIndex, toIndex);
        emit PayrollBatchExecuted(block.timestamp, fromIndex, toIndex);
    }

    function _executePayrollBatch(
        uint256 fromIndex,
        uint256 toIndex
    ) internal {
        for (uint256 i = fromIndex; i < toIndex; i++) {
            address emp = employeeList[i];
            if (!employees[emp].isActive) continue;

            euint64 salary = employees[emp].encryptedSalary;
            // Grant the token contract transient access to this handle
            FHE.allowTransient(salary, address(payToken));
            payToken.confidentialTransferFrom(employer, emp, salary);
            employees[emp].lastPayTimestamp = block.timestamp;
        }
    }

    // -----------------------------------------------------------------------
    //  View functions
    // -----------------------------------------------------------------------

    /// @notice Returns the encrypted salary of the caller (must be an active employee).
    function getMySalary() external view returns (euint64) {
        require(employees[msg.sender].isActive, "Not active employee");
        return employees[msg.sender].encryptedSalary;
    }

    /// @notice Returns the encrypted salary of a given employee (employer only).
    function getEmployeeSalary(
        address emp
    ) external view onlyEmployer returns (euint64) {
        return employees[emp].encryptedSalary;
    }

    /// @notice Check whether an address is an active employee.
    function isEmployee(address addr) external view returns (bool) {
        return employees[addr].isActive;
    }

    /// @notice Return public (non-confidential) metadata for an employee.
    function getEmployeeInfo(
        address emp
    )
        external
        view
        returns (bool isActive, uint256 lastPayTimestamp, uint256 addedAt)
    {
        Employee storage e = employees[emp];
        return (e.isActive, e.lastPayTimestamp, e.addedAt);
    }

    /// @notice Total number of employees ever added (including removed).
    function getEmployeeCount() external view returns (uint256) {
        return employeeList.length;
    }

    /// @notice Number of currently active employees.
    function getActiveEmployeeCount() external view returns (uint256) {
        return activeEmployeeCount;
    }
}
