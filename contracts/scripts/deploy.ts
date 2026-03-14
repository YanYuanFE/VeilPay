import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Deploy PayrollToken
  const PayrollToken = await ethers.getContractFactory("PayrollToken");
  const token = await PayrollToken.deploy("Payroll USD", "pUSD");
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("PayrollToken deployed to:", tokenAddr);

  // Deploy ConfidentialPayroll
  const ConfidentialPayroll =
    await ethers.getContractFactory("ConfidentialPayroll");
  const payroll = await ConfidentialPayroll.deploy(tokenAddr);
  await payroll.waitForDeployment();
  const payrollAddr = await payroll.getAddress();
  console.log("ConfidentialPayroll deployed to:", payrollAddr);

  // Output addresses for frontend
  console.log("\n--- Copy to frontend config ---");
  console.log(`VITE_TOKEN_ADDRESS=${tokenAddr}`);
  console.log(`VITE_PAYROLL_ADDRESS=${payrollAddr}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
