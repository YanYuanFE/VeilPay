import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("ConfidentialPayroll", function () {
  async function deployFixture() {
    const [employer, alice, bob] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("PayrollToken");
    const token = await Token.deploy("Payroll USD", "pUSD");
    await token.waitForDeployment();

    const Payroll = await ethers.getContractFactory("ConfidentialPayroll");
    const payroll = await Payroll.deploy(await token.getAddress());
    await payroll.waitForDeployment();

    return { token, payroll, employer, alice, bob };
  }

  describe("Deployment", function () {
    it("should set the deployer as employer", async function () {
      const { payroll, employer } = await loadFixture(deployFixture);
      expect(await payroll.employer()).to.equal(employer.address);
    });

    it("should set the correct pay token", async function () {
      const { token, payroll } = await loadFixture(deployFixture);
      expect(await payroll.payToken()).to.equal(await token.getAddress());
    });

    it("should start with zero employees", async function () {
      const { payroll } = await loadFixture(deployFixture);
      expect(await payroll.getEmployeeCount()).to.equal(0);
      expect(await payroll.getActiveEmployeeCount()).to.equal(0);
    });
  });

  describe("Employee Management", function () {
    it("should add an employee with encrypted salary", async function () {
      const { payroll, employer, alice } = await loadFixture(deployFixture);
      const payrollAddr = await payroll.getAddress();

      const input = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input.add64(5000n);
      const encrypted = await input.encrypt();

      await payroll.addEmployee(alice.address, encrypted.handles[0], encrypted.inputProof);

      expect(await payroll.isEmployee(alice.address)).to.be.true;
      expect(await payroll.getEmployeeCount()).to.equal(1);
      expect(await payroll.getActiveEmployeeCount()).to.equal(1);
    });

    it("should not allow non-employer to add employee", async function () {
      const { payroll, alice, bob } = await loadFixture(deployFixture);
      const payrollAddr = await payroll.getAddress();

      const input = hre.fhevm.createEncryptedInput(payrollAddr, alice.address);
      input.add64(5000n);
      const encrypted = await input.encrypt();

      await expect(
        payroll.connect(alice).addEmployee(bob.address, encrypted.handles[0], encrypted.inputProof)
      ).to.be.revertedWith("Not employer");
    });

    it("should remove an employee", async function () {
      const { payroll, employer, alice } = await loadFixture(deployFixture);
      const payrollAddr = await payroll.getAddress();

      const input = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input.add64(5000n);
      const encrypted = await input.encrypt();
      await payroll.addEmployee(alice.address, encrypted.handles[0], encrypted.inputProof);

      await payroll.removeEmployee(alice.address);
      expect(await payroll.getActiveEmployeeCount()).to.equal(0);
    });

    it("should not allow adding the same employee twice", async function () {
      const { payroll, employer, alice } = await loadFixture(deployFixture);
      const payrollAddr = await payroll.getAddress();

      const input1 = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input1.add64(5000n);
      const encrypted1 = await input1.encrypt();
      await payroll.addEmployee(alice.address, encrypted1.handles[0], encrypted1.inputProof);

      const input2 = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input2.add64(6000n);
      const encrypted2 = await input2.encrypt();

      await expect(
        payroll.addEmployee(alice.address, encrypted2.handles[0], encrypted2.inputProof)
      ).to.be.revertedWith("Already active");
    });

    it("should not allow non-employer to remove employee", async function () {
      const { payroll, employer, alice } = await loadFixture(deployFixture);
      const payrollAddr = await payroll.getAddress();

      const input = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input.add64(5000n);
      const encrypted = await input.encrypt();
      await payroll.addEmployee(alice.address, encrypted.handles[0], encrypted.inputProof);

      await expect(
        payroll.connect(alice).removeEmployee(alice.address)
      ).to.be.revertedWith("Not employer");
    });
  });

  describe("Salary Update", function () {
    it("should update an employee's salary", async function () {
      const { payroll, employer, alice } = await loadFixture(deployFixture);
      const payrollAddr = await payroll.getAddress();

      const input1 = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input1.add64(5000n);
      const encrypted1 = await input1.encrypt();
      await payroll.addEmployee(alice.address, encrypted1.handles[0], encrypted1.inputProof);

      const input2 = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input2.add64(7000n);
      const encrypted2 = await input2.encrypt();
      await payroll.updateSalary(alice.address, encrypted2.handles[0], encrypted2.inputProof);

      // Verify the employee is still active after salary update
      expect(await payroll.isEmployee(alice.address)).to.be.true;
    });

    it("should not allow updating salary of inactive employee", async function () {
      const { payroll, employer, alice } = await loadFixture(deployFixture);
      const payrollAddr = await payroll.getAddress();

      const input = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input.add64(5000n);
      const encrypted = await input.encrypt();

      await expect(
        payroll.updateSalary(alice.address, encrypted.handles[0], encrypted.inputProof)
      ).to.be.revertedWith("Not active");
    });
  });

  describe("Token", function () {
    it("should mint tokens", async function () {
      const { token, employer } = await loadFixture(deployFixture);
      await token.mint(employer.address, 1000000n);
      expect(await token.totalSupply()).to.equal(1000000n);
    });

    it("should set operator", async function () {
      const { token, employer, alice } = await loadFixture(deployFixture);
      const futureTime = Math.floor(Date.now() / 1000) + 86400;
      await token.setOperator(alice.address, futureTime);
      expect(await token.isOperator(employer.address, alice.address)).to.be.true;
    });

    it("should return false for expired operator", async function () {
      const { token, employer, alice } = await loadFixture(deployFixture);
      // Set an operator that expired in the past
      await token.setOperator(alice.address, 1);
      expect(await token.isOperator(employer.address, alice.address)).to.be.false;
    });

    it("should revoke operator by setting until to 0", async function () {
      const { token, employer, alice } = await loadFixture(deployFixture);
      const futureTime = Math.floor(Date.now() / 1000) + 86400;
      await token.setOperator(alice.address, futureTime);
      expect(await token.isOperator(employer.address, alice.address)).to.be.true;

      // Revoke
      await token.setOperator(alice.address, 0);
      expect(await token.isOperator(employer.address, alice.address)).to.be.false;
    });
  });

  describe("View Functions", function () {
    it("should return employee info", async function () {
      const { payroll, employer, alice } = await loadFixture(deployFixture);
      const payrollAddr = await payroll.getAddress();

      const input = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input.add64(5000n);
      const encrypted = await input.encrypt();
      await payroll.addEmployee(alice.address, encrypted.handles[0], encrypted.inputProof);

      const info = await payroll.getEmployeeInfo(alice.address);
      expect(info.isActive).to.be.true;
      expect(info.lastPayTimestamp).to.equal(0);
      expect(info.addedAt).to.be.greaterThan(0);
    });

    it("should report non-employee as not active", async function () {
      const { payroll, alice } = await loadFixture(deployFixture);
      expect(await payroll.isEmployee(alice.address)).to.be.false;
    });
  });
});
