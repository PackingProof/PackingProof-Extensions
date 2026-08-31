# PackingProof 扩展完整投稿教程

本文面向第一次投稿的开发者，也可以直接交给 AI 按步骤执行。市场只接收稳定的 Gitee/GitHub Release Asset，不托管第三方源码或 PPEXT 文件。

## 先判断你需要哪份文档

| 目标 | 应阅读的文档 |
| --- | --- |
| 制作 PPEXT、发布 Release、投稿市场 | 本文 |
| 了解市场登记、不可变版本和签名 | [扩展市场协议 v1](PROTOCOL_V1.md) |
| 让扩展与 Desktop 通信或申请权限 | [Desktop 扩展 API v1](https://gitee.com/PackingProof/PackingProof-Desktop/blob/main/docs/EXTENSION_API_V1.md)（[GitHub 备用链接](https://github.com/PackingProof/PackingProof-Desktop/blob/main/docs/EXTENSION_API_V1.md)） |

进入市场与使用扩展 API 是两件事。安装市场扩展不会自动开启扩展 API；`external-adapter` 解包后不会自动运行；扩展需要调用 API 时，仍要由用户在 Desktop 中开启扩展 API 并确认授权。市场签名和 SHA-256 证明“下载内容与审核登记一致”，不保证外部程序的内部行为安全。

## 投稿前准备

准备以下内容，缺少任何必填信息时先补齐，不要让工具或 AI 猜测：

- 可长期使用的扩展 ID，格式为 `<publisher-id>.<extension-slug>`；合并后不可修改，`packingproof.*` 仅供官方使用
- 作者或组织名称、公开主页、项目主页和一句话简介
- 一个公开的 Gitee 或 GitHub Release 仓库；推荐提供 Gitee，也可以只提供 GitHub
- `userscript` 的公开源码仓库与 OSI 认可的 SPDX 许可证
- 闭源 `external-adapter` 的作者公开主页、项目来源和可公开访问的使用条款
- Node.js 22 或更高版本，以及本仓库的 Fork/本地克隆

在市场仓库根目录安装工具：

```bash
npm ci
```

扩展项目目录可以位于市场仓库之外。工具不会把第三方源码或 PPEXT 复制进市场仓库。

## 方式一：交互式初始化

在市场仓库根目录运行：

```bash
npm run ppext -- init ../my-extension
```

工具会逐项询问并生成：

```text
my-extension/
├── manifest.json       作者可见的极简包清单
├── submission.json     首次登记所需的人工信息
└── payload/            放脚本或程序
```

`Publisher ID` 只是扩展 ID 的稳定前缀。例如扩展 ID 为 `example.orders` 时填写 `example`。它不是签名密钥，也不会授予官方身份。

## 方式二：给 AI 或自动化使用的非交互初始化

AI 应从用户或已有项目资料中取得所有参数，再执行命令。以下命令不应原样提交，必须替换示例值。

### userscript

```powershell
npm run ppext -- init ..\example-orders `
  --id example.orders `
  --publisher example `
  --name "Example Orders" `
  --type userscript `
  --provider gitee `
  --owner ExampleOrg `
  --repository ExampleOrders `
  --author "Example Org" `
  --author-url https://gitee.com/ExampleOrg `
  --version 1.0 `
  --min-version 0.0.63 `
  --payload payload/main.user.js `
  --summary "将示例平台订单发送到 PackingProof" `
  --description "在示例平台页面读取订单并发送到用户配置的 PackingProof 主机" `
  --homepage https://gitee.com/ExampleOrg/ExampleOrders `
  --license MIT `
  --license-url https://gitee.com/ExampleOrg/ExampleOrders/blob/main/LICENSE
```

要求：

- 版本必须是 `X.Y`，例如 `1.0`、`2.14`，不能填写 `1.0.0`
- payload 必须是一个 `.user.js` 文件
- 源码必须公开，许可证必须是 OSI 认可的 SPDX 标识
- 脚本开发规范、维护占位符和 API 调用方式见 Desktop 的 [第三方油猴脚本开发规范](https://gitee.com/PackingProof/PackingProof-Desktop/blob/main/docs/EXTENSION_API_V1.md#第三方油猴脚本开发规范)

将脚本放到 `..\example-orders\payload\main.user.js`。建议同时提供 `README.md`，可选图标必须命名为 `icon.png`。

### 开源 external-adapter

将上面的命令改为：

```text
--type external-adapter
--version 1.0.0
--payload payload/adapter.exe
```

开源外部适配器同样使用 `--license <SPDX>` 和 `--license-url <公开许可证地址>`。v1 只面向 Windows，作者不需要填写架构、安装模式或系统权限。

如果希望用户在市场中直接启动程序，可在包内 `manifest.json` 增加：

```json
"launcher": { "path": "payload/adapter.exe" }
```

路径只能指向 `payload/` 下的 `.exe`、`.cmd` 或 `.bat` 文件。未填写时，Desktop 会显示灰色不可用的“启动”按钮，用户仍可打开目录手动运行。PackingProof 只负责发起独立进程并提示启动错误，不监管外部程序运行，也不会因外部程序退出或崩溃而退出

### 闭源 external-adapter

闭源适配器使用三段版本并明确提供使用条款：

```powershell
npm run ppext -- init ..\example-adapter `
  --id example.adapter `
  --publisher example `
  --name "Example Adapter" `
  --type external-adapter `
  --source closed-source `
  --provider gitee `
  --owner ExampleOrg `
  --repository ExampleAdapter `
  --author "Example Org" `
  --author-url https://example.com `
  --version 1.0.0 `
  --min-version 0.0.63 `
  --payload payload/adapter.exe `
  --summary "连接示例设备与 PackingProof" `
  --description "由用户手动运行的 Windows 外部适配器" `
  --homepage https://example.com/adapter `
  --license Proprietary `
  --license-url https://example.com/adapter/terms
```

闭源适配器不需要填写源码仓库，但发布仓库、作者主页、项目主页和使用条款都必须公开可验证。客户端会统一显示“闭源外部程序”风险标识。

## 检查初始化文件

`manifest.json` 只描述安装包。例如 userscript：

```json
{
  "$schema": "https://packingproof.dev/schemas/author-manifest.v1.schema.json",
  "schemaVersion": 1,
  "id": "example.orders",
  "name": "Example Orders",
  "version": "1.0",
  "type": "userscript",
  "minPackingProofVersion": "0.0.63",
  "payload": "payload/main.user.js"
}
```

`submission.json` 描述作者和市场展示信息。`submit` 会读取它，不会根据 Release URL 猜测作者、名称、类型、许可证或源码状态。

如果同一制品同时发布到 Gitee 和 GitHub，在 `submission.json` 的 `publisher.accounts` 中加入两个账号，并把 `extension.releaseSources` 改为：

```json
[
  {"provider": "gitee", "owner": "ExampleOrg", "name": "ExampleOrders"},
  {"provider": "github", "owner": "ExampleOrg", "name": "ExampleOrders"}
]
```

数组顺序不代表主源或镜像。客户端存在 Gitee 下载地址时优先 Gitee，失败或哈希不符再尝试 GitHub。只提供一个平台不影响收录资格。

## 打包并发布 Release

在市场仓库根目录运行：

```bash
npm run ppext -- pack ../my-extension
```

工具会生成 `<扩展ID>-<版本>.ppext`。文件名必须保持不变，例如：

```text
example.orders-1.0.ppext
example.adapter-1.0.0.ppext
```

把该文件上传到登记平台的稳定 Release。建议 tag 使用 `v<版本>`，例如 `v1.0` 或 `v1.0.0`。不要使用 draft、prerelease、分支 Raw 文件、自建下载地址或后来覆盖同名制品。

如果登记两个平台，两个 Release 必须上传打包命令生成的同一个文件，不能分别重新打包。市场会比较字节、大小和 SHA-256，任一项不同都会拒绝。

## 生成首次登记

确认 Release 和 Asset 已经公开可下载后，在市场仓库根目录运行：

```bash
npm run submit -- --project ../my-extension
```

该命令会：

1. 读取并校验 `manifest.json` 和 `submission.json`
2. 查询所有登记的 Gitee/GitHub Release
3. 下载目标 PPEXT，验证格式、身份和基础 ZIP 安全规则
4. 双源存在时验证两个文件字节一致
5. 自动生成大小、SHA-256 和版本记录，并在本地预览 registry

该命令不会上传 Release、创建 Git commit、推送分支、创建 PR 或生成官方签名。成功后检查：

```text
publishers/<publisher-id>.json
extensions/<extension-id>/extension.json
extensions/<extension-id>/versions/<version>.json
registry/
```

不要手工修改已生成版本的大小、SHA-256、下载地址或 registry。发现基本信息错误时，先修正扩展项目中的 `submission.json`，删除本次尚未提交的版本文件后重新运行；绝不能修改已经合并的历史版本记录。

## 作者侧验证与 PR

运行：

```bash
npm test
npm run validate
npm run generate
```

`npm run generate` 成功表示 registry 可以由源数据生成。投稿时只提交本次生成的 Publisher、扩展和版本源文件，不提交 `registry/`；维护者批准后，受保护的签名任务会在同一个提交中生成并签名 registry，再发布到 GitHub 与 Gitee。

作者和 AI 不应运行 `registry:sign`，也不应接触、生成或索取市场私钥。`npm run check` 包含签名验证，registry 改变但维护者尚未重新签名时失败是预期行为。维护者审核通过后离线签名，再运行 `npm run check`。

PR 描述应说明：

- 新扩展还是新版本
- 扩展用途、作者与项目主页
- userscript 的源码和许可证，或 external-adapter 的开源/闭源状态与使用条款
- 提供 Gitee、GitHub 还是双源
- 实际使用的 PackingProof API 权限和能力；不调用 API 时明确写“无”
- 已运行的验证命令及结果

## 后续版本

首次登记合并后，开发者只需：

1. 更新 `manifest.json` 版本
2. 重新运行 `ppext pack`
3. 发布新的稳定 Release Asset

更新机器人每六小时检查所有已登记平台。任一平台发现新稳定版本即可创建候选 PR；双源同版本不一致时拒绝生成。机器人 PR 仍需维护者审核，不会自动合并。

如果基本展示信息或发布仓库需要调整，应单独提交 `extension.json` 变更并说明原因。扩展 ID、Publisher ID、类型和已经合并的版本记录不可修改。

## AI 执行规则

把本文交给 AI 时，应要求它遵守以下边界：

1. 先读取目标扩展仓库的开发规范、manifest、脚本元数据和许可证，再选择扩展类型与版本格式
2. 缺少扩展 ID、作者主页、项目主页、许可证/使用条款、发布平台账号或 Release 仓库时，停止并询问，不得猜测
3. 不得把 `packingproof.*` 分配给第三方，不得把闭源扩展登记为 userscript
4. 不得生成、读取、提交或请求市场签名私钥
5. 不得覆盖 Release Asset，不得修改或删除已合并的 `versions/*.json`
6. 只把同一次 `ppext pack` 的输出上传到双平台
7. `submit` 后核对生成路径、版本、下载平台、大小和 SHA-256，再运行作者侧验证
8. 工具只生成登记内容；除非用户明确授权，AI 不应假设它可以代替用户发布 Release、推送分支或创建 PR

## 常见失败

| 错误 | 处理 |
| --- | --- |
| `userscript 版本必须是 X.Y` | 把源版本改为两段，例如 `2.14` |
| `userscript payload 必须是 .user.js 文件` | 将 payload 放到 `payload/` 并使用 `.user.js` 后缀 |
| `扩展 ID 必须使用 Publisher ID 前缀` | 让 ID 以 `<publisher-id>.` 开头 |
| `发布源中没有找到 ...ppext` | 确认 Release 稳定、公开，Asset 名称完全匹配 |
| `Gitee 与 GitHub 制品不一致` | 删除错误 Asset，发布新版本；不要覆盖已经收录的版本 |
| `已有登记与 submission.json 不一致` | 首次 PR 前修正本次生成内容；已登记扩展改走独立信息变更 PR |
| `npm run check` 签名失败 | 投稿阶段运行作者侧命令，签名由维护者处理 |
