# AI 圆桌讨论 MVP：阶段2草稿服务

当前完成中文话题/人数运行时校验、草稿创建、单条与列表查询、SQLite持久化及创建幂等。创建不会生成阵容、发言或共识，也不会启动讨论。前端、模型调用、SSE和完整系统E2E尚未实现。

## 运行

在 PowerShell 中进入 `D:\实测文件夹`，使用系统 Node.js 24.16.0、npm 11.13.0（阶段1B实测基线）。不依赖 Codex 或探针缓存。

```powershell
Set-Location -LiteralPath 'D:\实测文件夹'
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build
npm run db:init
npm start
```

当前已经独立安装正式依赖并生成锁文件；重新安装遵循 `--ignore-scripts`，不要为安装提示擅自启用生命周期脚本。npm未做漏洞审计。直接依赖全部精确版本：Express 5.2.1；开发依赖 TypeScript 7.0.2、Vitest 5.0.1、Vite 8.3.0、@types/node 24.13.4、@types/express 5.0.6。Vite用于Vitest运行依赖，本轮未创建Vite前端。

服务固定绑定 `127.0.0.1`，默认端口3000；Ctrl+C关闭服务和数据库。不要同时启动多个后端共享同一个数据库文件。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| DATABASE_PATH | data/discussions.sqlite | 相对项目当前工作目录，或自定义绝对文件路径；启动/初始化自动创建目录和必要表，不清空已有数据 |
| PORT | 3000 | 1–65535整数，仅改变loopback端口 |

本模块无需模型密钥；不自动读取 `.env`。例如本地另开开发库：先设置 `$env:DATABASE_PATH = 'data/drafts-dev.sqlite'`，再执行初始化/启动命令。环境探针库在 `tools/env-probe/`；本轮测试每例创建 `.tmp/stage-2/case-*` 新文件，独立进程冒烟使用 `smoke-*`，全部忽略且保留，不删除用户文件。

## 接口

| 方法与路径 | 成功响应 |
|---|---|
| POST /api/discussions | 首次201，幂等重放200：discussionId、snapshot、replayed |
| GET /api/discussions/{discussionId} | 200：完整公开快照；不存在404 |
| GET /api/discussions?status=all | 200：items；默认status=active，不包含created草稿 |

```json
{"topic":"AI 如何改善教育？","expertCount":4,"requestId":"12345678-1234-4234-8234-123456789012"}
```

以 `Content-Type: application/json` POST 上述正文。示例UUID用于说明；每次有意新建生成一个新UUID，重试同一次创建复用原UUID。话题去首尾空白后1–500 Unicode码点；人数省略为4，不含主持人，合法整数1–8。禁止附加字段；同requestId规范化输入不同返回409。UUID大小写规范化为小写。

完整字段见 [HTTP契约](docs/contracts.md)。所有时间为UTC ISO 8601。草稿初态`created`，version/lastEventId为1，阵容/发言为空，综合/总结为null。列表按updatedAt降序、同时间discussionId升序。创建与第一条`discussion.status_changed`事件同事务提交；本轮没有事件读取或推送接口。

错误返回 `{ "error": { "code", "message", "retryable", "action", "requestId" } }`，示意字段名而非可提交JSON。400表示输入/JSON/正文限制/来源错误，404不存在，409幂等冲突，500内部错误。500提供安全中文信息；日志仅记随机关联ID及错误分类，不打印SQL、路径、正文或调用栈。无Origin的本机API客户端可用；带Origin的写请求只允许HTTP同源loopback，前端代理以后再接入。

## 验证

```powershell
npm test
node scripts/check-dependencies.mjs
# 先完成build；运行正式编译入口、真实HTTP与独立SQLite，结束后关闭服务
node scripts/http-smoke.mjs
```

`npm test`只包含本项目`tests/`，不计入环境探针，也不称为完整系统E2E。测试不依赖前一用例数据或固定休眠。完整过程、RED/GREEN与最终退出码见 [阶段2验证记录](docs/stage-2-validation.md)。

## 工程边界与下一步

- `src/domain/`：校验、业务服务、存储操作接口及公开投影，不导入SQLite驱动。
- `src/db/`：node:sqlite、参数绑定、两张必要表、短事务；初始化入口为`src/init-db.ts`。
- `src/http/app.ts`：只创建Express应用；`src/server.ts`才监听端口。
- 当前模式仅支持草稿，数据库约束与公开类型也限定草稿；未来扩展生命周期必须先设计非破坏迁移，不能直接借`IF NOT EXISTS`迁移旧结构。
- 后续建议另行授权“阵容生成契约与可控模型边界”，先TDD再实现；前端、模型能力及Win10完整E2E仍未验证。
- 实际开发工具Codex；题面工具口径待出题方确认。Git身份未提供，无提交/远程，历史不倒填。
