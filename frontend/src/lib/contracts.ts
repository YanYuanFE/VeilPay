export const SEPOLIA_RPC_URL = import.meta.env.VITE_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
export const PAYROLL_TOKEN_ADDRESS = import.meta.env.VITE_TOKEN_ADDRESS || '0xa6daf4C41b62Be614c9596828C371492E7109FFc'
export const PAYROLL_MANAGER_ADDRESS = import.meta.env.VITE_PAYROLL_ADDRESS || '0x914B2b9bbe76C4BA1Ec35785791Ada874Af5801b'

export const PayrollTokenABI = [
  // View functions
  { type: 'function', name: 'name', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint64' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'confidentialBalanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'isOperator', inputs: [{ name: 'holder', type: 'address' }, { name: 'operator', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  // State-changing functions
  { type: 'function', name: 'mint', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint64' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setOperator', inputs: [{ name: 'operator', type: 'address' }, { name: 'until', type: 'uint48' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'confidentialTransfer', inputs: [{ name: 'to', type: 'address' }, { name: 'encryptedAmount', type: 'bytes32' }, { name: 'inputProof', type: 'bytes' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'confidentialTransferFrom', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  // Events
  { type: 'event', name: 'ConfidentialTransfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }] },
  { type: 'event', name: 'Mint', inputs: [{ name: 'to', type: 'address', indexed: true }, { name: 'amount', type: 'uint64' }] },
  { type: 'event', name: 'OperatorSet', inputs: [{ name: 'holder', type: 'address', indexed: true }, { name: 'operator', type: 'address', indexed: true }, { name: 'until', type: 'uint48' }] },
] as const

export const ConfidentialPayrollABI = [
  // View functions
  { type: 'function', name: 'employer', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'payToken', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'activeEmployeeCount', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getEmployeeCount', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getActiveEmployeeCount', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'employeeList', inputs: [{ name: 'index', type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'isEmployee', inputs: [{ name: 'addr', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'getEmployeeInfo', inputs: [{ name: 'emp', type: 'address' }], outputs: [{ name: 'isActive', type: 'bool' }, { name: 'lastPayTimestamp', type: 'uint256' }, { name: 'addedAt', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getMySalary', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getEmployeeSalary', inputs: [{ name: 'emp', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  // State-changing functions
  { type: 'function', name: 'addEmployee', inputs: [{ name: 'employee', type: 'address' }, { name: 'encryptedSalary', type: 'bytes32' }, { name: 'inputProof', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'updateSalary', inputs: [{ name: 'employee', type: 'address' }, { name: 'newEncryptedSalary', type: 'bytes32' }, { name: 'inputProof', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'removeEmployee', inputs: [{ name: 'employee', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'executePayroll', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'executePayrollBatch', inputs: [{ name: 'fromIndex', type: 'uint256' }, { name: 'toIndex', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  // Events
  { type: 'event', name: 'EmployeeAdded', inputs: [{ name: 'employee', type: 'address', indexed: true }, { name: 'timestamp', type: 'uint256' }] },
  { type: 'event', name: 'EmployeeRemoved', inputs: [{ name: 'employee', type: 'address', indexed: true }, { name: 'timestamp', type: 'uint256' }] },
  { type: 'event', name: 'SalaryUpdated', inputs: [{ name: 'employee', type: 'address', indexed: true }, { name: 'timestamp', type: 'uint256' }] },
  { type: 'event', name: 'PayrollExecuted', inputs: [{ name: 'timestamp', type: 'uint256' }, { name: 'employeesPaid', type: 'uint256' }] },
  { type: 'event', name: 'PayrollBatchExecuted', inputs: [{ name: 'timestamp', type: 'uint256' }, { name: 'fromIndex', type: 'uint256' }, { name: 'toIndex', type: 'uint256' }] },
] as const
