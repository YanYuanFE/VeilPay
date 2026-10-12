# VeilPay

VeilPay 是面向 Arc 的隐私薪资项目，目标是在 USDC 资金池内部隐藏员工的工资分配和余额，并提供可验证的资金守恒与赎回流程。

当前状态：G0 验真已完成；交易电路和金库合约已部署到 Arc 测试网，入金、私密发薪、提现与重复花费拒绝在链上跑通。凭证加密与员工端扫描解密已完成并在测试网验证。`web/` 是独立的前端与后端项目，支持创建组织、批量邀请成员、批量发薪和员工提现，已在本地对接 Arc 测试网完成端到端验证，尚未部署到 Vercel。尚无中继服务。

## 代码结构

- `web/`：Vite + React + shadcn/ui 前端，后端为 Vercel Function + Postgres。证明在浏览器内生成；后端只保存组织、成员名单、收款地址，以及用雇主查看密钥封装的发薪记录。详见 [web/README.md](web/README.md)。

- `circuits/transaction.circom`：统一交易电路。1 个输入凭证、16 个输出凭证（每笔最多发 15 人，另 1 份为找零），公开入金、提现与手续费金额；入金时输入为零金额占位凭证。约 25.2k 约束，23 个公开输入。
- `contracts/src/VeilPayVault.sol`：不可升级的 USDC 金库。深度 20 的 Poseidon 承诺树（每笔交易插入 16 叶子子树）、32 个历史根、nullifier 集合，以及绑定收款人、手续费接收者和密文的 `extDataHash`。
- `contracts/src/TransactionVerifier.sol`：由 `scripts/build_circuit.sh` 导出的 Groth16 verifier。
- `prover/prove.mjs`：本地生成交易证明，并重建 Merkle 路径。
- `contracts/test/VeilPayVault.t.sol`：11 个测试，通过 ffi 调用真实 prover。覆盖充值、私密发薪、经中继提现、重复花费、篡改收款人/手续费/密文/金额、跨金库重放、未知根、被封禁地址的原子回滚、无授权入金、增发与盗用他人凭证。
- `contracts/script/Deploy.s.sol`：部署 Poseidon 哈希合约、verifier 和金库。
- `prover/wallet.mjs`：钱包。从 32 字节种子派生花费秘密和 X25519 查看密钥；用 libsodium sealed box 加密凭证（密文固定 153 字节）；扫描链上事件、解密并核对承诺。`prover/wallet.test.mjs` 有 8 个测试（`node --test prover/*.test.mjs`）。
- `prover/testnet_flow.mjs`：用 cast 驱动测试网完整流程；从 `NewCommitment` 事件重建承诺树，USDC 转账在 Arc 节点上真实执行。

## 构建与测试

```bash
npm ci
./scripts/build_circuit.sh          # 编译电路、本地单方初始化、导出 verifier
(cd contracts && forge test)
```

## 部署到 Arc 测试网

在 `contracts/.env` 写入 `PRIVATE_KEY=0x...`（仅使用测试网专用账户，至少需要约 1 USDC 加 gas）：

```bash
cd contracts && forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.io --broadcast && cd ..
PRIVATE_KEY=0x... node prover/testnet_flow.mjs <vault> <deployBlock> research/<report>.json
```

`forge script` 在本地 EVM 预先模拟，无法执行 Arc USDC 依赖的预编译，所以 USDC 流程用 cast 直接发交易。

### 当前测试网部署（v2，16 输出，2026-10-12）

| 合约 | 地址 |
| --- | --- |
| VeilPayVault | `0x206b534BF9025AFc7B31f18639aE5DeA07dbf5Bb`（区块 66832820） |
| TransactionVerifier | `0x16407bCA8d512C0f42Ec28C9FF50eD33C5847CB0` |
| Poseidon(2) | `0x75e8A8aFF131492125887cd9cB11C894b4271953` |

浏览器端到端验证：入金 1 USDC（1,667,032 gas），一笔交易给 4 人私密发薪（1,597,168 gas，16 个输出），员工扫描后部分提现。每笔满载可发 15 人，约 10.7 万 gas/人。前端只对接 v2；v1 金库中的测试网余额保留在原合约内，未迁移。用户密钥派生消息冻结在 v1 文本，换金库不改变已注册的收款地址。

### 2026-10-12 测试网部署（v1，4 输出，已停用）

| 合约 | 地址 |
| --- | --- |
| VeilPayVault | `0x99b143A677f49B13053Ec99C5fB16116bf0A49Ff`（区块 66795653） |
| TransactionVerifier | `0xeaA45532F03CE35c0F816F8AC01aAF86dE669257` |
| Poseidon(2) | `0xD87d10cc49c3d04DaC256b533F95547017204e16` |

[流程报告](research/arc-vault-testnet-flow-2026-10-12.json)：入金 1 USDC（1,189,073 gas），私密发薪 0.2/0.3/0.4 加 0.1 找零（1,119,221 gas），提现 0.15 并支付 0.01 手续费、找零 0.14（1,192,206 gas）。重放已花费凭证被节点以 `nullifier spent` 拒绝；金库余额 0.84 USDC，与账本一致。

[加密流程报告](research/arc-vault-testnet-encrypted-flow-2026-10-12.json)：同一金库上使用真实密文再跑一遍。各方扫描链上事件后，雇主只看到 0.1 找零，Alice、Bob、Carol 分别只看到 0.2、0.3、0.4，局外钱包看不到任何凭证；Bob 仅凭种子重建出提现后的 0.14 余额。发薪交易的 calldata 中没有明文金额和备注。

单笔 `transact` 本地约 1.12–1.20M gas，其中约 21 次链上 Poseidon 调用占大头。原型的 Groth16 初始化只有一方参与，仅限测试，不可承载真实资金。

## 文档

- 产品与协议文档：应用内 `/docs` 页面（源码 `web/src/pages/Docs.tsx`），涵盖使用指南、协议设计、隐私模型、合约地址与 API。
- [2026 年 10 月 12 日主网配对测试记录](research/arc-bn254-check-2026-10-12.json)：两个 Arc 主网 RPC 的非空 BN254 pairing 正反向测试。
- [包含完整向量的复现结果](research/arc-bn254-reproduction-2026-10-12.json)：点加法、标量乘法和配对校验在两个主网 RPC 上均通过。
- G0 Groth16 验真：早期用最小 Poseidon 承诺电路验证 Arc 能运行 snarkjs 导出的 verifier。实验代码已移除，结果保留在下方报告中。
- [G0 测试网结果](research/arc-g0-groth16-testnet-2026-10-12.json)、[G0 主网结果](research/arc-g0-groth16-mainnet-2026-10-12.json)：有效证明通过，5 种篡改均被拒绝，单次验证约 200,812 gas。
- [预编译检查脚本](scripts/check_arc_bn254.py)：只读检查点加法、标量乘法与配对预编译，不发送交易或使用钱包。

## 复现基础兼容性检查

脚本只使用 Python 标准库。运行环境需要能够访问 Arc 公共 RPC。

```bash
python3 scripts/check_arc_bn254.py --network mainnet --output /tmp/veilpay-bn254-check.json
```

检查测试网时使用 `--network testnet`。返回非零退出码表示出现网络错误或某个测试结果不匹配，不能仅据此断言链不支持该功能。

预编译检查通过只说明基础运算可用，不能代替真实 Groth16 验证合约、薪资电路和资金流程的测试。
