# AI 圆桌讨论 MVP：阶段4B阵容后端与状态兼容

已完成草稿创建/查询、SQLite持久化及幂等；新增Fake阵容生成、失败重试、整套重新生成和当前版本确认。创建仍不自动生成阵容，确认不启动讨论。前端只接受新状态并显示中文文本，没有生成/确认按钮或成员卡片。

**本轮未接真实模型，Fake Provider通过不等于真实模型已验证。** 讨论调度、SSE、共识和完整演播厅尚未实现。

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
| DATABASE_PATH | data/discussions.sqlite | 相对当前目录或自定义绝对路径；仅db:init显式初始化/升级，启动只校验 |
| PORT | 3000 | 1–65535整数，仅改变loopback端口 |

本模块无需模型密钥；不自动读取 `.env`。例如本地另开开发库：先设置 `$env:DATABASE_PATH = 'data/drafts-dev.sqlite'`，再执行初始化/启动命令。环境探针库在 `tools/env-probe/`；本轮测试每例创建 `.tmp/stage-2/case-*` 新文件，独立进程冒烟使用 `smoke-*`，全部忽略且保留，不删除用户文件。

### 001/002与已有库维护

空库按001→002建立；001只严格接管阶段2最终schema，002才新增阵容字段和lineup_members。未知DDL/对象或迁移历史不匹配即停止，所有待执行版本同事务，失败回滚。重复执行不重建或改变数据/迁移时间。

对已有待迁移文件，db:init先产生新的`原文件.backup-UUID.sqlite`一致备份并验证可读，不覆盖已有备份；维护前停止全部写入者。启动不自动迁移，缺库/旧库先db:init；遗留generating在监听前记为LINEUP_INTERRUPTED失败，不自动续跑，恢复失败不监听。**本轮仅在测试自建旧schema夹具验证，没有迁移开发库或用户已有业务库。**

## 接口

| 方法与路径 | 成功响应 |
|---|---|
| POST /api/discussions | 首次201，幂等重放200：discussionId、snapshot、replayed |
| GET /api/discussions/{discussionId} | 200：完整公开快照；不存在404 |
| GET /api/discussions?status=all | 200：items；默认status=active，不包含created草稿 |
| POST /api/discussions/{id}/lineup | requestId、expectedGenerationId；新受理/生成中重放202，ready/失败同请求重放200 |
| POST /api/discussions/{id}/lineup/confirm | generationId、lineupRevision；200确认，同版重复replayed:true |

```json
{"topic":"AI 如何改善教育？","expertCount":4,"requestId":"12345678-1234-4234-8234-123456789012"}
```

以 `Content-Type: application/json` POST 上述正文。示例UUID用于说明；每次有意新建生成一个新UUID，重试同一次创建复用原UUID。话题去首尾空白后1–500 Unicode码点；人数省略为4，不含主持人，合法整数1–8。禁止附加字段；同requestId规范化输入不同返回409。UUID大小写规范化为小写。

完整字段见 [HTTP契约](docs/contracts.md)。所有时间为UTC ISO 8601。草稿初态`created`，version/lastEventId为1，阵容/发言为空，综合/总结为null。列表按updatedAt降序、同时间discussionId升序。创建与第一条`discussion.status_changed`事件同事务提交；本轮没有事件读取或推送接口。

首次生成正文为`{"requestId":"新UUID","expectedGenerationId":null}`；失败重试/重新生成必须新requestId及GET当前generationId。确认正文为`{"generationId":"GET当前UUID","lineupRevision":1}`，revision必须取真实GET值。示例占位字符串不能提交。生命周期为created→generating_lineup→awaiting_confirmation→lineup_confirmed，失败到lineup_generation_failed。生成中不能强制替换；已确认不能再生成。

重新生成受理后旧组立即不可确认；失败保留旧行但公开roles为空，新成功才整组替换。历史成功保存在public_events。created仍19字段，其他四态21字段；active仅生成中/待确认，失败和已确认在all。每次状态变更和事件同事务。Fake走生产校验管线，系统赋ID/颜色/顺序；总计两次调用共享网络/修复预算，单次30秒、总期60秒、本地有效任务容量4。

错误返回 `{ "error": { "code", "message", "retryable", "action", "requestId" } }`，示意字段名而非可提交JSON。400输入/JSON/正文/来源错误，404不存在，409幂等/版本/状态冲突，429容量不足，503已识别存储故障，500未知内部错误。已受理Provider失败通过GET200的安全lastNotice表达。诊断只含分类及关联ID，不输出SQL、路径、正文或栈。无Origin本地客户端允许；带Origin写请求只允许HTTP同源loopback，Vite保持原Host/Origin。

## 验证

```powershell
npm test
node scripts/check-dependencies.mjs
# 先完成build；运行正式编译入口、真实HTTP与独立SQLite，结束后关闭服务
node scripts/http-smoke.mjs
node scripts/http-smoke.mjs --lineup
```

`npm test`只包含本项目`tests/`，不计入环境探针，也不称为完整系统E2E。测试不依赖前一用例数据或固定休眠。完整过程、RED/GREEN与最终退出码见 [阶段2验证记录](docs/stage-2-validation.md)。

## 工程边界与下一步

- `src/domain/`：校验、业务服务、存储操作接口及公开投影，不导入SQLite驱动。
- `src/db/`：node:sqlite、参数绑定、001/002、四张表（含迁移记录）、短事务；初始化入口为`src/init-db.ts`。
- `src/http/app.ts`：只创建Express应用；`src/server.ts`才监听端口。
- 当前支持草稿及四种阵容状态；002不允许未来running等状态。存储边界与Provider解耦，无ORM；`src/providers/`只有Fake。
- web/src为React组件、API运行时校验及请求状态控制；只共享浏览器安全的输入校验和类型，不打包数据库或服务端配置。
- 后续建议另行授权4C完整阵容前端交互与Fake E2E；真实模型、讨论调度及完整系统仍需后续授权。
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

test:e2e自动运行独立回环41841/41842，显式初始化新.tmp/stage-4b/browser-*测试SQLite，不复用已有服务器，结束时关闭自有进程。使用本机Edge独立非持久化上下文，无需下载；不可用时报告失败。报告/trace在被忽略的evidence/stage-4b/raw，精选截图与命令记录纳入Git。4B无依赖安装/升级。

最终结果：后端190项（99单元＋91集成）、前端25项、局部E2E10项通过；三套类型检查、两端构建、两组独立进程冒烟退出0。E2E为原9项＋API驱动状态兼容1项，不是完整阵容操作UI验收。Windows10本机成功不等于官方支持或移动设备验证。详见[阶段4B验证记录](docs/stage-4b-validation.md)及[实施计划](docs/superpowers/plans/2026-09-16-lineup-backend.md)。
