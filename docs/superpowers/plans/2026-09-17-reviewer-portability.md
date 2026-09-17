# 验收环境便利性实施计划

依据用户已确认的环境检查、浏览器可选、运行说明及实际复验方向执行；当前会话顺序完成，不启用子代理/worktree。官方模型请求0，不更改业务/授权/数据库，不升级依赖。

1. 环境检查：scripts/reviewer-tools.mjs 提供 Node 版本检查和浏览器选项；scripts/check-environment.mjs 在安装前检查 Node/SQLite，安装后可检查依赖与浏览器。tests/unit/reviewer-tools.test.ts 先业务RED后GREEN；新增脚本严格checkJs。
2. 浏览器消费者：当前三份Playwright配置、交付冒烟与共享验收UI使用同一E2E_BROWSER配置，默认chromium，可选msedge/chrome，未知值明确失败。测试覆盖默认、选择和拒绝，不放宽业务parser；真实入口不运行。
3. 使用说明：npm check:env、setup、check:browser；README提供统一跨Shell命令、Fake优先、独立模型配置、浏览器安装及Windows/macOS/Linux边界；不自动安装浏览器。旧报告保留，新增本轮记录。
4. 验证发布：最后修改后运行定向及相关回归、类型/构建，独立干净目录按README安装/初始化/样例/Fake界面及核心E2E。新Chromium在本机验证；其他系统未验证。核验敏感范围/旧保护哈希，正常提交推送main，生成更新ZIP（仍不含独立Prompt/工作流文档）。

验收标准：无Edge也可按文档配置测试；错误Node版本、缺依赖/浏览器有可执行提示；原Fake流程继续通过；无真实外呼；本机证据不冒充跨系统认证。
