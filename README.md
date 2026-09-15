# AI 圆桌讨论 MVP：阶段3中文草稿工作区

当前完成中文话题/人数运行时校验、草稿创建、单条与列表查询、SQLite持久化及创建幂等。创建不会生成阵容、发言或共识，也不会启动讨论。现可在中文首页创建、筛选、查看草稿与刷新后重新读取；模型调用、SSE和完整讨论系统E2E尚未实现。

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

当前已经独立安装正式依赖并生成锁文件；重新安装遵循 `--ignore-scripts`，不要为安装提示擅自启用生命周期脚本。npm未做漏洞审计。直接依赖全部精确版本：Express 5.2.1；开发依赖 TypeScript 7.0.2、Vitest 5.0.1、Vite 8.3.0、@types/node 24.13.4、@types/express 5.0.6。前端直接依赖React/react-dom 19.3.0，类型包@types/react及@types/react-dom均19.3.0，浏览器测试@playwright/test 1.63.0。均沿用1B实测版本，在正式根目录生成锁文件并核对实际解析路径。

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

错误返回 `{ "error": { "code", "message", "retryable", "action", "requestId" } }`，示意字段名而非可提交JSON。400表示输入/JSON/正文限制/来源错误，404不存在，409幂等冲突，500内部错误。500提供安全中文信息；日志仅记随机关联ID及错误分类，不打印SQL、路径、正文或调用栈。无Origin的本机API客户端可用；带Origin的写请求只允许HTTP同源loopback，Vite的/api代理保留原Host/Origin（changeOrigin:false），无需放开跨域。

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
- web/src为React组件、API运行时校验及请求状态控制；只共享浏览器安全的输入校验和类型，不打包数据库或服务端配置。
- 后续建议另行授权阵容生成的模型边界和非破坏迁移，先TDD再实现；模型能力、完整讨论E2E、受官方支持的操作系统仍未验证。
- 实际开发工具Codex；题面工具口径待出题方确认。Git使用用户暂定署名schen与邮箱cs064210@163.com，仅配置当前仓库，实际当前时间建立基线与后续提交；无远程，历史不倒填。

## 中文前端与局部浏览器测试

先按上文启动后端，再打开第二个PowerShell终端：

```powershell
Set-Location -LiteralPath 'D:\实测文件夹'
npm run dev:web
```

访问 http://127.0.0.1:5173 。前端固定回环5173，严格占用检查；默认代理后端3000。后端改端口时，在前端终端设置WEB_API_TARGET为实际回环HTTP地址。页面使用相对/api路径，不配置模型密钥。

创建成功立即显示服务端草稿快照并切换“全部讨论”；“进行中”默认不含草稿。刷新会重新加载默认列表，可切换全部并选回草稿；不承诺保存尚未提交的表单或上次选中项。失败且输入不变的重试沿用requestId和正文；修改输入或成功后再次明确创建使用新ID。刷新浏览器不会保留内存中的待重试ID，结果不确定时先查看全部讨论。

```powershell
npm run typecheck:web
npm run typecheck:e2e
npm run test:web
npm run build:web
npm run build
npm run test:e2e
```

test:e2e自动运行独立回环41841/41842前后端和新建.tmp/stage-3/browser-*测试SQLite，不复用已有服务器，结束时关闭自有进程。使用本机已安装Edge的独立非持久化上下文，无需下载浏览器；Edge不可用时报告失败，不自动下载或读取个人浏览器资料。原始浏览器报告/trace位于被忽略的evidence/stage-3/raw，精选截图及命令记录纳入Git。

本轮结果：后端79项回归、前端18项单元、9项局部浏览器测试通过；浏览器中正常真实链路与网络故障注入分别标记。Windows10本机成功不等于官方支持或真实移动设备验证。详见[阶段3验证记录](docs/stage-3-validation.md)。
