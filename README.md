# PackingProof Extensions

PackingProof 官方扩展登记仓库，负责公开协议、发布者和扩展登记、不可变版本记录、生成市场索引与候选更新 PR。

本仓库不托管第三方扩展源码或制品。扩展源码必须位于公开的 GitHub/Gitee 仓库，安装包必须以 `.ppx` Release Asset 发布。

## v1 支持范围

- `userscript`：由 PackingProof 导入到现有油猴脚本管理流程
- `external-adapter`：PackingProof 校验并解包后展示说明和所在目录，永不自动执行
- 官方扩展优先使用 Gitee 主发布源和 GitHub 镜像；主发布源发现失败时，更新机器人尝试镜像发现
- 只有稳定 SemVer 版本；不收录 draft、prerelease 或 Raw 文件
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
npm run check
git diff --exit-code
```

协议细节见 [扩展市场协议 v1](docs/PROTOCOL_V1.md)，提交扩展见 [贡献指南](CONTRIBUTING.md)。

## 安全边界

SHA-256 只能证明下载字节与已审核登记一致，不能证明第三方代码安全。外部适配器是用户手动运行的普通程序，不受 PackingProof 沙箱限制；系统访问声明来自开发者，并由维护者审核，但无法由 PackingProof 强制阻止
