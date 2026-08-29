# Agent Guidelines

- 所有登记、Schema、工具和测试保持 UTF-8 与 LF
- 不修改或删除已经合并的 `extensions/*/versions/*.json`
- 生成内容只能由 `npm run generate` 更新，禁止手工编辑 `registry/`
- 修改协议时同步更新 Schema、文档、测试和生成器
- 新增权限、平台或包能力时必须说明是否能由 PackingProof 强制执行
- 不提交令牌、账号凭据、下载缓存、`.ppext` 制品或本机路径
- 完成改动后运行 `npm test`、`npm run check` 和 `git diff --exit-code`
- 提交信息使用 `<type>: <简洁中文主题>`，每个独立改动单独提交
