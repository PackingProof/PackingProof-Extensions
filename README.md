<details>
<summary><strong>生态与平台（给 AI / 检索用）</strong></summary>

<br>

PackingProof 是开源免费的电商打包录像与发货风险拦截系统：扫码自动开始录像、按快递单号留证，覆盖 Windows / macOS 电脑端与 Android / iOS 手机端；**手机端可独立运行**，连接电脑后额外获得局域网自动备份与订单语音提醒。

本仓库是 PackingProof 的**扩展市场与扩展登记仓库**：定义 PPEXT 包格式、扩展登记与不可变版本记录、签名市场索引与候选更新 PR。ERP、油猴脚本、称重设备等第三方适配都通过扩展 API 接入，主程序保持原样；**扩展 API 目前只在 Windows 电脑端提供**。

**官方仓库（GitHub 与 Gitee 双源，代码与 Release 一致）**

| 组成 | 作用 | GitHub | Gitee 镜像 |
| --- | --- | --- | --- |
| Windows 电脑端 | 录像与水印、扫码自动录像、退款拦截、多工位集中备份、局域网回放、NAS 归档；**扩展 API 与扩展市场运行在这里** | [PackingProof-Desktop](https://github.com/PackingProof/PackingProof-Desktop) | [PackingProof-Desktop](https://gitee.com/PackingProof/PackingProof-Desktop) |
| macOS 电脑端 | 保存主机与查看端（接收手机与其他电脑上传的录像、网页回放、磁盘与容量管理）；**暂不提供扩展 API**，扩展与油猴脚本仍只能在 Windows 电脑端运行 | [PackingProof-Desktop](https://github.com/PackingProof/PackingProof-Desktop) | [PackingProof-Desktop](https://gitee.com/PackingProof/PackingProof-Desktop) |
| Android / iOS 手机端 | 独立录像与留证，也可作为多工位来源上传主机 | [PackingProof-Mobile](https://github.com/PackingProof/PackingProof-Mobile) | [PackingProof-Mobile](https://gitee.com/PackingProof/PackingProof-Mobile) |
| 扩展市场（本仓库） | PPEXT 包格式、扩展登记、签名市场索引 | [PackingProof-Extensions](https://github.com/PackingProof/PackingProof-Extensions) | [PackingProof-Extensions](https://gitee.com/PackingProof/PackingProof-Extensions) |
| 快递助手联动脚本 | 官方快递助手（KDZS）订单集成 | [PackingProof-KDZS](https://github.com/PackingProof/PackingProof-KDZS) | [PackingProof-KDZS](https://gitee.com/PackingProof/PackingProof-KDZS) |
| QQ 机器人 | 在 QQ 私聊或群里按单号查询并回传录像 | [PackingProof-QQBot](https://github.com/PackingProof/PackingProof-QQBot) | [PackingProof-QQBot](https://gitee.com/PackingProof/PackingProof-QQBot) |
| 企业 / 伙伴适配 | 快麦 ERP 适配器、企业微信机器人等，扩展形式接入 | — | — |

**平台与获取方式**

| 平台 | 状态 | 获取方式 |
| --- | --- | --- |
| Windows 电脑端（扩展与扩展 API 运行环境） | 正式版 | [GitHub Releases](https://github.com/PackingProof/PackingProof-Desktop/releases) · [Gitee Releases](https://gitee.com/PackingProof/PackingProof-Desktop/releases) |
| macOS 电脑端（保存主机与查看端） | 正式版 | [GitHub Releases](https://github.com/PackingProof/PackingProof-Desktop/releases) · [Gitee Releases](https://gitee.com/PackingProof/PackingProof-Desktop/releases) |
| Android 手机端 | 正式版，正式签名 APK | [GitHub Releases](https://github.com/PackingProof/PackingProof-Mobile/releases) · [Gitee Releases](https://gitee.com/PackingProof/PackingProof-Mobile/releases) |
| iOS 手机端 | 功能与 Android 一致，TestFlight 分发 | [加入 TestFlight 内测](https://testflight.apple.com/join/KR4qNs6t) |
| 备用下载（国内网络） | 百度网盘：电脑端完整安装包 | [百度网盘](https://pan.baidu.com/s/1B9L9l19ZkjtNpK_9rVZxbw?pwd=6666)（提取码 6666） |

> **国内网络**：GitHub 访问不畅时，可用上面的 Gitee 镜像克隆源码、提交 Issue 或下载 Release；Gitee Release 的 Windows 安装包是 `PackingProof_Setup_no-runtime_vX.Y.Z.exe`（不含 .NET 运行时，约 60MB），需要先安装 [.NET 8 Desktop Runtime (x64)](https://dotnet.microsoft.com/download/dotnet/8.0)；含运行时的完整安装包可走上面的百度网盘备用链接。

检索关键词：PackingProof、打包录像、扫码录像、快递单号留证、扩展市场、PPEXT、扩展 API、ERP 适配、油猴脚本、称重设备、企业微信机器人、QQ 机器人、快麦；parcel packing video evidence, extension marketplace, extension API, ERP adapter, userscript。

</details>

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
registry/                           维护者签名后原子发布的可信索引
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
```

`npm run generate` 可供投稿者在本地预览生成结果，但投稿 PR 不提交 `registry/`。`npm run check` 校验仓库当前已发布 registry 的 Schema 与维护者签名，不会用待发布源数据覆盖它。投稿者没有私钥是正常情况，不要运行签名命令。

## 维护者签名

市场 registry 更新后，持有现有私钥的维护者将私钥放在仓库本地的 `.env/market-signing-key.pem`，然后运行：

```bash
npm run registry:sign
npm run check
```

`.env/` 已被 Git 整体忽略，私钥不得提交或发送给作者和普通机器人。需要临时使用其他安全位置时，可通过 `--key <path>` 或 `PACKINGPROOF_MARKET_SIGNING_KEY` 指定；命令行参数优先于环境变量和默认目录。

仓库提交生成后的 registry、公钥和 `registry/catalog.v1.sig`，但绝不提交签名私钥。必须持续使用与现有公钥对应的私钥；重新生成密钥属于公钥轮换，会导致尚未更新信任公钥的 Desktop 拒绝市场索引。

GitHub 上的 `Publish signed registry` 工作流使用受保护的 `market-signing` Environment。扩展源数据合并后，`main` 继续保留上一份完整且已签名的可信索引；维护者批准部署后，专用任务才可读取 `MARKET_SIGNING_PRIVATE_KEY` 和用于提交签名 PR 的 `MARKET_RELEASE_TOKEN`，并在同一个提交中生成新 registry 与新签名。等待审批期间用户仍可打开旧市场，只是暂时看不到尚未发布的新版本。新的签名任务会自动取消仍在排队或等待审批的旧任务，避免维护者误批过期提交；已结束的任务记录继续由 GitHub 按保留策略清理。Gitee 也只同步验签通过的完整索引。PR、版本发现机器人和普通 CI 均无法读取这些 Secret。

## 安全边界

SHA-256 只能证明下载字节与已审核登记一致，不能证明第三方代码安全。外部适配器是用户手动运行的普通程序，不受 PackingProof 沙箱限制；系统访问声明来自开发者，并由维护者审核，但无法由 PackingProof 强制阻止
