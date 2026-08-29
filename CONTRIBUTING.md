# 开发 PackingProof 扩展

开发者只需要准备扩展信息和发布文件。Publisher、版本哈希、registry 与签名由工具和维护者处理。

## 第一次发布

1. 克隆本仓库并运行 `npm ci`
2. 运行 `npm run ppx -- init <项目目录>`，按提示填写扩展名称、作者、说明和发布来源
3. 将脚本或程序放入生成的 `payload/`，运行 `npm run ppx -- pack <项目目录>`
4. 将 `<扩展ID>-<版本>.ppx` 上传到 Gitee、GitHub 或两边的稳定 Release
5. 运行 `npm run submit -- --project <项目目录>`，检查生成内容并提交 PR

`ppx init` 生成的 `manifest.json` 只有以下字段：

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

`README.md` 和 `icon.png` 都是可选文件。PPX 会自动接受格式与基础安全校验，开发者不需要手工计算 SHA-256。

## 后续版本

更新 `manifest.json` 版本、重新打包并上传新的稳定 Release。更新机器人会检查所有已登记的 Gitee/GitHub 发布源并创建候选 PR。

## 发布来源

- 每个版本至少上传到 Gitee 或 GitHub 之一，推荐优先提供 Gitee
- 同时上传到两边时，必须上传完全相同的 PPX
- 只接受 Release Asset，不接受分支 Raw 文件、draft 或 prerelease
- 扩展 ID 和已经合并的版本记录不可修改

## 源码政策

- `userscript` 必须公开源码并使用 OSI 认可的许可证
- `external-adapter` 公开源码优先，也允许闭源、免费或商业发布
- 闭源外部适配器必须提供可验证的作者主页、项目主页和使用条款
- 闭源程序会在市场和安装确认页显示醒目的风险提示

市场收录不表示 PackingProof 能保证第三方程序安全。外部适配器是用户手动运行的普通程序，PackingProof 不会自动执行，也无法限制其网络、文件或其他系统访问。
