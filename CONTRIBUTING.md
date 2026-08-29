# 贡献指南

## 登记新扩展

1. 先在 `publishers/` 登记稳定 Publisher ID
2. 在 `extensions/<publisher-id>.<extension-slug>/extension.json` 登记扩展
3. 在公开源码仓库创建稳定 Release，并上传 `<extension-id>-<version>.ppx`
4. 主源和镜像存在时必须提供完全相同的 `.ppx`
5. 运行 `npm test`、`npm run check`，提交源数据与生成后的 `registry/`

扩展必须公开源码并使用 OSI 认可的 SPDX 许可证。扩展 ID 和已合并版本记录不可修改。

## 发布新版本

更新机器人会定时发现稳定 Release、验证 `.ppx` 并创建候选 PR。作者也可以手工增加 `versions/<version>.json`，但必须使用真实 Release Asset 大小和 SHA-256。

如果主发布源 API 不可用，机器人会尝试登记的镜像发布源发现版本。版本记录的 `primary` 使用本次实际可验证的登记源，另一可用来源记录为 `mirror`。

## 审核

维护者检查：

- 源码标签与 40 位提交哈希
- 相邻版本代码差异和构建产物
- PackingProof API 权限与声明性系统访问变化
- 网络、文件、进程和设备访问用途
- 许可证、隐私与外部依赖风险
- `.ppx` manifest、大小和主镜像哈希

维护者可以使用 AI 或其他自动化工具辅助审查，但 AI 不是信任根。合并只代表允许扩展进入市场，不代表 PackingProof 为第三方代码提供安全保证。

## 撤回版本

不要删除或修改历史版本文件。为问题版本新增 `advisories/<extension-id>/<version>.json`，填写结构化原因和可选 `replacedBy`
