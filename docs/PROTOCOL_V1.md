# PackingProof 扩展市场协议 v1

## 身份模型

Publisher ID 是与托管平台账号分离的稳定身份。GitHub/Gitee 用户名或组织迁移时只更新 Publisher 账号映射，不改变 Publisher ID 或 Extension ID。

新扩展 ID 使用 `<publisher-id>.<extension-slug>`。`packingproof.*` 为官方保留命名空间。官方身份由 registry 生成策略派生，不接受扩展自行声明。

## 登记模型

`extension.json` 保存扩展静态信息和最多两个 `releaseSources`。GitHub/Gitee 地位相同，数组顺序没有主源语义。

每个稳定版本使用独立的 `versions/<semver>.json`，保存：

- 源码标签、提交和发布时间
- 可选 Gitee/GitHub 下载地址、公共 SHA-256 与大小
- PackingProof 兼容范围及平台架构
- PackingProof API 权限、能力和声明性系统访问

版本记录合并后不可修改、覆盖或删除。远端 Release Asset 内容变化会导致哈希校验失败，必须发布新版本。

## Release 规则

- 只接受 GitHub/Gitee Release Asset
- Asset 名称固定为 `<extension-id>-<version>.ppx`
- 不接受 Raw、分支文件、自建 CDN、draft 或 prerelease
- 每个版本至少提供 Gitee 或 GitHub 地址之一，推荐优先发布到 Gitee
- 同时提供两个平台时必须是同一字节流
- 更新机器人独立检查所有登记源，任一来源可发现新稳定版本
- 新版本使用 `downloads.gitee`、`downloads.github`；旧版 `primary/mirror` 记录继续兼容且不可修改

## `.ppx` 格式

`.ppx` 是 ZIP 分发容器，不是可执行格式。

```text
manifest.json   必须
payload/        必须
README.md       可选
icon.png        可选
```

作者只填写 ID、名称、版本、类型、最低 PackingProof 版本和 payload。`ppx pack` 自动生成包含 `packageFormatVersion`、安装方式和兼容信息的包内 manifest。安装模式只能是：

- `userscript-import`，使用 `payloadPath` 指向一个 `.user.js`
- `manual-external`，使用 `suggestedPath` 指向建议用户查看的文件

协议没有自动执行、安装脚本、卸载脚本或命令钩子。`suggestedPath` 不授权 PackingProof 启动文件。

## 平台

油猴脚本使用独立平台：

```json
{
  "platforms": {
    "userscript": ["any"]
  }
}
```

外部适配器 v1 只接受 Windows，作者不需要选择架构：

```json
{
  "platforms": {
    "windows": ["any"]
  }
}
```

Schema 为后续版本预留 `macos`、`linux`、`android` 和 `ios`，但 v1 准入策略不会收录这些外部适配器。

## 权限

市场 v1 不要求作者在 PPX 中填写系统访问分类。PackingProof API 权限以扩展实际发起的授权请求和用户批准结果为准。

外部适配器是普通程序，PackingProof 无法沙箱限制其网络、文件、进程或设备访问。客户端始终显示这一边界；闭源适配器额外显示“闭源外部程序”提示。

## 索引签名

`registry/catalog.v1.json` 使用 ECDSA P-256/SHA-256 分离签名。目录记录每个详情文件的 SHA-256，客户端先验证目录签名，再验证详情文件。

私钥只由维护者离线保管，不进入仓库、作者工具、机器人或 CI。作者 PR 完成校验后，由维护者在合并或发布前签名。

## 撤回

撤回公告独立于不可变版本记录，包含 `reasonCode`、用户可读消息、`withdrawnAt` 和可选 `replacedBy`。被撤回版本不可新装，替代版本必须已登记且未撤回。v1 撤回公告合并后同样不可修改
