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

  describe("Payroll Execution", function () {
    it("should execute payroll for active employees", async function () {
      const { token, payroll, employer, alice } = await loadFixture(deployFixture);
      const payrollAddr = await payroll.getAddress();
      const tokenAddr = await token.getAddress();

      // Mint tokens to employer
      await token.mint(employer.address, 100000n);

      // Approve payroll contract as operator
      const futureTime = Math.floor(Date.now() / 1000) + 86400;
      await token.setOperator(payrollAddr, futureTime);

      // Add employee with salary 5000
      const input = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input.add64(5000n);
      const encrypted = await input.encrypt();
      await payroll.addEmployee(alice.address, encrypted.handles[0], encrypted.inputProof);

      // Execute payroll
      await payroll.executePayroll();

      // Verify lastPayTimestamp was updated
      const info = await payroll.getEmployeeInfo(alice.address);
      expect(info.lastPayTimestamp).to.be.greaterThan(0);
    });

    it("should not allow non-employer to execute payroll", async function () {
      const { payroll, alice } = await loadFixture(deployFixture);
      await expect(
        payroll.connect(alice).executePayroll()
      ).to.be.revertedWith("Not employer");
    });

    it("should execute batch payroll within bounds", async function () {
      const { token, payroll, employer, alice, bob } = await loadFixture(deployFixture);
      const payrollAddr = await payroll.getAddress();

      await token.mint(employer.address, 100000n);
      const futureTime = Math.floor(Date.now() / 1000) + 86400;
      await token.setOperator(payrollAddr, futureTime);

      // Add two employees
      const input1 = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input1.add64(3000n);
      const enc1 = await input1.encrypt();
      await payroll.addEmployee(alice.address, enc1.handles[0], enc1.inputProof);

      const input2 = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input2.add64(4000n);
      const enc2 = await input2.encrypt();
      await payroll.addEmployee(bob.address, enc2.handles[0], enc2.inputProof);

      // Execute batch for only first employee
      await payroll.executePayrollBatch(0, 1);

      const infoAlice = await payroll.getEmployeeInfo(alice.address);
      const infoBob = await payroll.getEmployeeInfo(bob.address);
      expect(infoAlice.lastPayTimestamp).to.be.greaterThan(0);
      expect(infoBob.lastPayTimestamp).to.equal(0); // not yet paid
    });

    it("should reject batch with out-of-bounds index", async function () {
      const { payroll } = await loadFixture(deployFixture);
      await expect(
        payroll.executePayrollBatch(0, 10)
      ).to.be.revertedWith("Index out of bounds");
    });

    it("should skip removed employees during payroll", async function () {
      const { token, payroll, employer, alice, bob } = await loadFixture(deployFixture);
      const payrollAddr = await payroll.getAddress();

      await token.mint(employer.address, 100000n);
      const futureTime = Math.floor(Date.now() / 1000) + 86400;
      await token.setOperator(payrollAddr, futureTime);

      const input1 = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input1.add64(3000n);
      const enc1 = await input1.encrypt();
      await payroll.addEmployee(alice.address, enc1.handles[0], enc1.inputProof);

      const input2 = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input2.add64(4000n);
      const enc2 = await input2.encrypt();
      await payroll.addEmployee(bob.address, enc2.handles[0], enc2.inputProof);

      // Remove alice
      await payroll.removeEmployee(alice.address);

      // Execute payroll — should only pay bob
      await payroll.executePayroll();

      const infoAlice = await payroll.getEmployeeInfo(alice.address);
      const infoBob = await payroll.getEmployeeInfo(bob.address);
      expect(infoAlice.lastPayTimestamp).to.equal(0); // skipped
      expect(infoBob.lastPayTimestamp).to.be.greaterThan(0);
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
