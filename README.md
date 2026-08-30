# PackingProof Extensions

PackingProof 官方扩展登记仓库，负责公开包格式、扩展登记、不可变版本记录、签名市场索引与候选更新 PR。

本仓库不托管第三方扩展源码或制品。安装包必须以 GitHub/Gitee `.ppext` Release Asset 发布；用户脚本要求公开源码，外部适配器允许闭源并显示风险提示。

## 三个概念

| 概念 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| 扩展市场 | 展示、审核、版本发现、下载地址、SHA-256 和签名索引 | 不运行扩展，也不托管第三方制品 |
| PPEXT | 把 `manifest.json`、`payload/`、可选说明和图标封装成安装包 | 不是可执行格式，也不代表扩展已获 API 权限 |
| 扩展 API | 扩展运行后与 PackingProof 通信、申请授权并交换业务数据 | 不负责发布、下载或安装扩展 |

三者可以单独使用：本地 `.user.js` 不必进入市场；不调用扩展 API 的外部工具也可以打包为 PPEXT；需要 API 的市场扩展则同时遵守市场投稿规则和 Desktop 的扩展 API 协议。安装市场扩展不会自动开启扩展 API，外部适配器安装后也不会自动运行。

## 从这里开始

- 想投稿扩展：先读 [贡献指南](CONTRIBUTING.md)，再按 [完整投稿教程](docs/PUBLISHING.md) 操作
- 想了解包格式、不可变版本和签名：读 [扩展市场协议 v1](docs/PROTOCOL_V1.md)
- 想调用 Desktop 接口：读 [PackingProof Desktop 扩展 API v1](https://gitee.com/PackingProof/PackingProof-Desktop/blob/main/docs/EXTENSION_API_V1.md)（[GitHub 备用链接](https://github.com/PackingProof/PackingProof-Desktop/blob/main/docs/EXTENSION_API_V1.md)）
- 负责审核：读 [扩展审核指南](docs/REVIEW_GUIDE.md)

## v1 支持范围

- `userscript`：由 PackingProof 导入到现有油猴脚本管理流程
- `external-adapter`：PackingProof 校验并解包后展示说明和所在目录，永不自动执行
- GitHub/Gitee 均可作为发布源；客户端存在 Gitee 地址时优先使用 Gitee，失败后尝试 GitHub
- userscript 使用稳定 `X.Y` 源版本，external-adapter 使用稳定 `X.Y.Z`；不收录 draft、prerelease 或 Raw 文件
- 官方与第三方两级来源标识；市场收录不代表安全保证

## 目录

```text
publishers/                         稳定发布者身份
extensions/<id>/extension.json     扩展静态信息
extensions/<id>/versions/*.json    不可变版本记录
advisories/<id>/*.json             撤回与替代版本
schemas/                            JSON Schema
registry/                           随 PR 提交的生成索引
tools/                              校验、生成和更新工具
tests/                              自动化测试
fixtures/                           不进入正式索引的测试数据
```

## 本地校验

需要 Node.js 22 或更高版本。

```bash
npm ci
npm test
npm run validate
npm run generate
git diff --exit-code
```

`npm run check` 还会验证维护者签名，适合仓库当前已签名 registry 或维护者重新签名后使用。投稿者修改 registry 后没有私钥是正常情况，不要运行签名命令。

## 维护者签名

市场 registry 更新后，持有现有私钥的维护者将私钥放在仓库本地的 `.env/market-signing-key.pem`，然后运行：

```bash
npm run registry:sign
npm run check
```

`.env/` 已被 Git 整体忽略，私钥不得提交、发送给作者、机器人或 CI。需要临时使用其他安全位置时，可通过 `--key <path>` 或 `PACKINGPROOF_MARKET_SIGNING_KEY` 指定；命令行参数优先于环境变量和默认目录。

仓库只提交 `registry/catalog-public-key.pem` 和 `registry/catalog.v1.sig`。必须持续使用与现有公钥对应的私钥；重新生成密钥属于公钥轮换，会导致尚未更新信任公钥的 Desktop 拒绝市场索引。

## 安全边界

SHA-256 只能证明下载字节与已审核登记一致，不能证明第三方代码安全。外部适配器是用户手动运行的普通程序，不受 PackingProof 沙箱限制；系统访问声明来自开发者，并由维护者审核，但无法由 PackingProof 强制阻止
