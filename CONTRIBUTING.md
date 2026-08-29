# 开发 PackingProof 扩展

开发者只需要准备扩展基本信息、payload 和 Release Asset。工具会生成 Publisher 登记、版本哈希和 registry；维护者审核并签名。第一次投稿不会由工具自动提交 Git commit 或创建 PR。

如果你还不确定扩展市场、PPEXT 与扩展 API 的区别，先看 [README 的概念说明](README.md#三个概念)。需要逐字段示例、双发布源、闭源适配器或 AI 非交互操作时，直接阅读 [完整投稿教程](docs/PUBLISHING.md)。

## 第一次发布

1. Fork 并克隆本仓库，安装 Node.js 22 或更高版本，然后运行 `npm ci`
2. 运行 `npm run ppext -- init <项目目录>`，按提示填写扩展名称、作者、说明、许可证和发布来源
3. 检查生成的 `manifest.json` 与 `submission.json`，再将脚本或程序放入 `payload/`
4. 运行 `npm run ppext -- pack <项目目录>`，把生成的 `<扩展ID>-<版本>.ppext` 上传到 Gitee、GitHub 或两边的稳定 Release
5. Release 对外可访问后，运行 `npm run submit -- --project <项目目录>`，检查工具在 `publishers/`、`extensions/` 和 `registry/` 生成的内容
6. 运行作者侧验证，提交这些生成文件并向本仓库 `main` 分支创建 PR

```bash
npm test
npm run validate
npm run generate
git diff --exit-code
```

最后一条命令应当没有输出。不要运行 `registry:sign`，也不要向维护者索取私钥；官方签名由维护者在审核通过后完成。

`ppext init` 生成的 `manifest.json` 只有以下字段：

```json
{
  "schemaVersion": 1,
  "id": "example.adapter",
  "name": "Example Adapter",
  "version": "1.0.0",
  "type": "external-adapter",
  "minPackingProofVersion": "1.0.0",
  "payload": "payload/adapter.exe"
}
```

`userscript` 的源版本必须使用 `X.Y`，例如 `2.14`；Desktop 安装时生成的 `X.Y.Z` 中，`Z` 是设备配置修订号，不属于市场版本。`external-adapter` 继续使用 `X.Y.Z`。

`README.md` 和 `icon.png` 都是可选文件。PPEXT 会自动接受格式与基础安全校验，开发者不需要手工计算 SHA-256。

## 后续版本

更新 `manifest.json` 版本、重新打包并上传新的稳定 Release。更新机器人会检查所有已登记的 Gitee/GitHub 发布源并创建候选 PR。机器人 PR 仍需维护者审核，不会自动合并。

## 发布来源

- 每个版本至少上传到 Gitee 或 GitHub 之一，推荐优先提供 Gitee
- 同时上传到两边时，必须上传完全相同的 PPEXT
- 只接受 Release Asset，不接受分支 Raw 文件、draft 或 prerelease
- 扩展 ID 和已经合并的版本记录不可修改

## 源码政策

- `userscript` 必须公开源码并使用 OSI 认可的许可证
- `external-adapter` 公开源码优先，也允许闭源、免费或商业发布
- 闭源外部适配器必须提供可验证的作者主页、项目主页和使用条款
- 闭源程序会在市场和安装确认页显示醒目的风险提示

市场收录不表示 PackingProof 能保证第三方程序安全。外部适配器是用户手动运行的普通程序，PackingProof 不会自动执行，也无法限制其网络、文件或其他系统访问。

完整的 `userscript`、开源/闭源 `external-adapter` 流程、单源/双源填写方式和常见错误见 [完整投稿教程](docs/PUBLISHING.md)。
