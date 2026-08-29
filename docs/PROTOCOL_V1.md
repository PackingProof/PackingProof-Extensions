# PackingProof 扩展市场协议 v1

## 身份模型

Publisher ID 是与托管平台账号分离的稳定身份。GitHub/Gitee 用户名或组织迁移时只更新 Publisher 账号映射，不改变 Publisher ID 或 Extension ID。

新扩展 ID 使用 `<publisher-id>.<extension-slug>`。`packingproof.*` 为官方保留命名空间。官方身份由 registry 生成策略派生，不接受扩展自行声明。

## 登记模型

`extension.json` 只保存扩展本身的静态信息和按优先级排列的 `releaseSources`。第一项是主发布源，第二项是可选镜像发布源。

每个稳定版本使用独立的 `versions/<semver>.json`，保存：

- 源码标签、提交和发布时间
- 主下载地址、可选镜像、公共 SHA-256 与大小
- PackingProof 兼容范围及平台架构
- PackingProof API 权限、能力和声明性系统访问

版本记录合并后不可修改、覆盖或删除。远端 Release Asset 内容变化会导致哈希校验失败，必须发布新版本。

## Release 规则

- 只接受 GitHub/Gitee Release Asset
- Asset 名称固定为 `<extension-id>-<version>.ppx`
- 不接受 Raw、分支文件、自建 CDN、draft 或 prerelease
- 官方扩展优先使用 Gitee 主源、GitHub 镜像；第三方扩展可按实际托管情况选择主源
- 镜像存在时必须使用另一平台
- 主源和镜像必须是同一字节流
- 更新机器人先检查主发布源；主源发现请求失败后检查镜像发布源
- 每个版本的 `primary` 指向本次实际可验证的登记源；另一可用来源记录为 `mirror`

## `.ppx` 格式

`.ppx` 是 ZIP 分发容器，不是可执行格式。

```text
manifest.json   必须
payload/        必须
README.md       可选
icon.png        可选
```

manifest 同时包含 `schemaVersion: 1` 和 `packageFormatVersion: 1`。安装模式只能是：

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

外部适配器 v1 只接受 Windows：

```json
{
  "platforms": {
    "windows": ["x64", "arm64"]
  }
}
```

Schema 为后续版本预留 `macos`、`linux`、`android` 和 `ios`，但 v1 准入策略不会收录这些外部适配器。

## 权限

`packingProofPermissions` 和 `packingProofCapabilities` 对应现有 Extension API v1，后续客户端可以限制扩展实际申请不超过包声明。

`systemAccess` 是普通程序可能使用网络、文件、进程、串口、摄像头、麦克风、剪贴板或浏览器数据的开发者声明。PackingProof 无法沙箱限制用户手动运行的外部适配器，客户端必须明确显示这一差异。

## 撤回

撤回公告独立于不可变版本记录，包含 `reasonCode`、用户可读消息、`withdrawnAt` 和可选 `replacedBy`。被撤回版本不可新装，替代版本必须已登记且未撤回。v1 撤回公告合并后同样不可修改
