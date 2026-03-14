import { ethers } from "hardhat";

async function main() {
  const token = await ethers.getContractAt(
    "PayrollToken",
    "0xa6daf4C41b62Be614c9596828C371492E7109FFc"
  );
  const [deployer] = await ethers.getSigners();

  const amount = BigInt(100_000) * BigInt(1_000_000); // 100,000 pUSD (6 decimals)
  console.log("Minting 100,000 pUSD to", deployer.address);

  const tx = await token.mint(deployer.address, amount);
  console.log("Tx:", tx.hash);
  await tx.wait();

  console.log("Done. Total supply:", (await token.totalSupply()).toString());
}

main().catch(console.error);
