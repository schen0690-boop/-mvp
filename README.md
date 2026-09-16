# AI 圆桌讨论 MVP：阶段6A讨论适配器与本地验证

已完成草稿创建/查询、阵容生成与确认、Fake讨论执行、内容驱动调度、增量提炼和有限总结。中文页面可明确开始讨论、实时观察、结束并刷新恢复记录；创建不自动生成阵容，确认不自动开始。演播厅显示真实已提交的发言、角色公开状态、观点证据及总结。

**4D已完成一次真实阵容联调，原授权已关闭。普通启动仅Fake，无需密钥。** 本轮未调用真实讨论模型；Fake通过不代表真实讨论质量。当前验收见[阶段5C验证](docs/stage-5c-validation.md)，不要重新执行历史4D受限入口。

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

### 001/002/003与已有库维护

空库按001→002→003建立；001严格接管阶段2最终schema，002新增阵容字段和lineup_members，003才增加讨论运行、发言、观点证据和角色状态。001/002不修改。未知DDL/对象或迁移历史不匹配即停止，所有待执行版本同事务，失败回滚。重复执行不重建或改变数据/迁移时间。

对已有待迁移文件，db:init先产生新的`原文件.backup-UUID.sqlite`一致备份并验证可读，不覆盖已有备份；维护前停止全部写入者。启动不自动迁移，缺库/旧库先db:init；遗留generating在监听前记为LINEUP_INTERRUPTED失败，不自动续跑，恢复失败不监听。**本轮仅在测试自建旧schema夹具验证，没有迁移开发库或用户已有业务库。**

## 接口

阶段5B新增：POST `/api/discussions/{discussionId}/start`，正文为`{"requestId":"新UUID","generationId":"当前阵容UUID","lineupRevision":1}`（必须替换实际ID/版本）；首次202、重复200，返回discussionId/runId/snapshot/replayed。POST同路径`/stop`正文`{}`，运行/收尾202、终态200快照。GET读取已保存记录，不启动runner。

正常12次专家公开发言或10分钟后收尾；总结不可用也可能completed，须检查summary.status及安全提示。失败终态不能重新开播。服务启动先取得数据库`.owner`占用，再把确实中断的running/stopping记为failed/RUN_INTERRUPTED，不自动续跑。未知遗留占用文件必须由操作人先确认原进程已停止，程序不自动删除或误杀进程。

阶段5C回归命令为`npm test`、`npm run test:web`、三项typecheck、两项build及`npm run test:e2e`。一并执行并保存本轮证据可用`node scripts/stage5c-verify.mjs`。浏览器配置为playwright.stage5c.config.ts，使用已安装Edge独立上下文、41861/41862端口、每轮新建.tmp/stage-5c/browser-*数据库；不下载浏览器，不复用已占用端口，retries=0。旧26条及新增演播厅测试都保留，截图写入evidence/stage-5c。旧阶段配置仅作历史记录，不用于当前截图验收。

SSE为`GET /api/discussions/{id}/events?after=lastEventId`，通过Vite的同源/api代理。初始和故障恢复用GET；阵容生成仍用原有限轮询；确认后的讨论用一条EventSource。事务事件整批应用，断线保留内容、有限恢复后提供手动重新连接。观察、刷新、切页不POST开始/结束。业务终态和网络中断分开显示；completed且summary.unavailable时明确显示“讨论已结束，但总结生成失败。”。

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
- 当前003支持草稿、四种阵容状态及running/stopping/completed/failed。存储与Provider解耦，无ORM；普通入口明确组合Fake阵容与讨论Provider，真实阵容适配器仅供历史受限入口。
- web/src为React组件、API运行时校验及请求状态控制；只共享浏览器安全的输入校验和类型，不打包数据库或服务端配置。
- 4D单样本真实阵容联调已完成且授权已关闭；5B/5C完成Fake讨论调度与演播厅，尚未实现真实讨论适配器或验证完整产品全部要求。
- 实际开发工具Codex；题面工具口径待出题方确认。Git使用用户暂定署名schen与邮箱cs064210@163.com，仅配置当前仓库，实际当前时间建立基线与后续提交；无远程，历史不倒填。

## 中文前端与局部浏览器测试

先按上文启动后端，再打开第二个PowerShell终端：

```powershell
Set-Location -LiteralPath 'D:\实测文件夹'
npm run dev:web
```

访问 http://127.0.0.1:5173 。前端固定回环5173，严格占用检查；默认代理后端3000。后端改端口时，在前端终端设置WEB_API_TARGET为实际回环HTTP地址。页面使用相对/api路径，不配置模型密钥。

创建成功立即显示服务端草稿快照并切换“全部讨论”；“进行中”默认不含草稿。URL中的discussion参数保存选中ID，刷新以GET恢复真实快照，不保存阵容到localStorage；不保留尚未提交的表单。失败且输入不变的重试沿用requestId和正文；修改输入或成功后再次明确创建使用新ID。刷新浏览器不会保留内存中的待重试ID，结果不确定时先查看全部讨论。

```powershell
npm run typecheck:web
npm run typecheck:e2e
npm run test:web
npm run build:web
npm run build
npm run test:e2e
```

test:e2e自动运行独立回环41841/41842，显式初始化新.tmp/stage-4d/browser-*测试SQLite，不复用已有服务器，结束时关闭自有进程。使用本机Edge独立非持久化上下文，无需下载；不可用时报告失败。报告/trace在被忽略的evidence/stage-4d/raw，精选截图与命令记录纳入Git。4D无依赖安装/升级。测试入口仅在Provider边界注入可控结果，测试标记不影响生产server；网络故障用例单独标记。

最新验证见[阶段4D记录](docs/stage-4d-validation.md)，原阵容UI交付见[阶段4C记录](docs/stage-4c-validation.md)。完整讨论系统、真实模型质量与移动真机仍未验证；Windows10本机Edge成功不等于官方支持认证。

## 阵容操作

1. 创建草稿或从列表选择草稿，点击“生成阵容”。生成只在主动操作时POST。
2. 生成中每2秒串行GET，当前页面监测窗口最多60次自动查询。终态即停；超限保留生成态，使用“重新检查状态”手动GET。
3. 离线暂停自动查询且不消耗离线期间预算；联网后在剩余预算内GET，不重发生成。后台/窄屏离开详情暂停；切换讨论丢弃迟到结果。
4. 待确认时查看主持人、专家的姓名/职业/头衔/立场及颜色。“重新生成”一经受理隐藏旧卡片，失败只提供新代重试。
5. 确认提交当前generationId和lineupRevision。409重新GET并提示，不自动重提；GET也失败时先手动检查再允许确认。500/503/断网保留卡片，可以明确重试。
6. 确认后只读，没有开始讨论、修改或撤销按钮。当前Fake成员是演示数据，不代表真实人物。

## 阶段4D：配置及受限联调记录

2026-09-16已完成4D-B单样本真实阵容联调：1次请求成功，确认与刷新通过，剩余调用权限已关闭。结果见[阶段4D验证](docs/stage-4d-validation.md)。以下启动步骤是原验收入口说明，不构成再次生成授权；保留现有计数、绑定、关闭记录与验收库，不删除后重跑。

正常 `npm start` 保持明确Fake模式，不加载私有配置；普通Vitest/Playwright也只使用Fake或显式HTTP stub。本轮没有改变任何依赖版本或SQLite迁移。

配置示例在根目录 `.env.backend.example`，真实文件仅为 `D:\实测文件夹\.env.backend.local`。由用户本人操作，已有文件不覆盖：

```powershell
Set-Location -LiteralPath 'D:\实测文件夹'
if (!(Test-Path -LiteralPath '.env.backend.local')) {
  Copy-Item -LiteralPath '.env.backend.example' -Destination '.env.backend.local'
}
notepad .env.backend.local
# 填写后保存；不要将密钥发到聊天，也不要使用Get-Content/type展示文件
npm run config:check
git check-ignore .env.backend.local
```

`config:check`只输出“密钥已配置 / 未配置”，不联网。已配置仅表示本地必要设置有效，不能证明鉴权/余额/模型调用成功。Git忽略匹配应输出该路径；私有文件不在web/public，不使用VITE_*变量。填写完成后回复“已配置”，当前不要主动点击真实生成。

示例内容（DEEPSEEK_API_KEY由用户在本地填写）：

```dotenv
ROSTER_PROVIDER=deepseek
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_API_KEY=
DEEPSEEK_MAX_TOKENS=4096
```

只有显式 `npm run live:stage4d` 导入后端配置加载器，以Node内置parseEnv读取该文件，不回退到全局/其他工具凭据。真实模式配置错误直接停止，不转Fake。若需要继续Fake演示，使用普通npm start即可；不通过浏览器切换供应商。

### 用户确认配置后才执行的真实验收入口

```powershell
# 后端，须先npm run build；本轮当前不执行
npm run live:stage4d
# 独立前端终端，连接验收后端，不改变原开发服务
$env:WEB_API_TARGET = 'http://127.0.0.1:41852'
npm run dev:web -- --port 41851
```

独立端口41851/41852、验收库`.local/stage-4d-live/discussions.sqlite`；只初始化新库，已有库仅检查schema，未知库停止。网页创建唯一“AI 如何改善教育？”、4专家另加主持人；只点一次生成，然后查看/确认/刷新。失败后停止，不点重试/重新生成，不做curl/Hello/模型列表探测，不使用会自动重跑的真实E2E。

固定目录`.local/stage-4d-live/authorization`保存不含秘密的discussion/generation绑定、发送前request-1/2预约、白名单结果指标与关闭状态；独占创建+fsync，重跑不清零。有效正文复用已有parseRoster检查后立即关闭后续出站权限，随后仍走服务层校验/系统赋值/事务保存。确定性错误、第二次失败和停止都关闭余量。不删除或更改该目录、server.lock或验收库以获得新授权。崩溃残留锁会拒绝自动重启，需要核对记录，不能自动清锁。

后端最多运行10分钟，Ctrl+C可提前停止并关闭授权。GET/确认/刷新不调用模型。取消会中断本地HTTP连接，但不能保证远端停止或不计费。请求上限是整个本轮累计2次；4096只是本轮输出限制。

实际实现、RED→GREEN、本地回归及待执行真实记录见[阶段4D验证](docs/stage-4d-validation.md)。
# 阶段6A补充：真实讨论适配器的本地验证

四种讨论能力已提供DeepSeek协议适配器；本阶段只能连接测试注入的本地HTTP替身，不代表真实讨论质量。正常 `npm start` 仍显式使用Fake阵容和Fake讨论，不读取私有配置。`DISCUSSION_PROVIDER` 与 `ROSTER_PROVIDER` 独立：`readDiscussionConfig` 默认fake，deepseek缺配置抛configuration；工厂在deepseek模式必须显式注入transport，没有静默回退或默认官方发送入口。配置值不是请求授权。不要使用 `live:stage4d` 验证讨论。

项目根目录执行（现有依赖，无需安装）：

```powershell
npm run build
npm test
npm run test:web
npm run test:e2e:local-adapter
node scripts/stage6a-verify.mjs
```

最后一条顺序执行全部测试、类型/构建、旧37项Fake E2E及2项本地HTTP适配器E2E；回归截图重定向到 `evidence/stage-6a`，不覆盖历史实证。本地接入使用 `.tmp/stage-6a/browser-*` 独立SQLite，前端41871/后端41872、HTTP stub随机loopback端口、虚拟凭据；Playwright采用已安装Edge，retries=0，不下载浏览器。端口占用即失败，不复用未知服务。测试入口无公开故障控制接口；文件门闩仅用于观察已发生的中途状态，不预生成整场脚本。后端Vitest默认禁止非loopback fetch；本地入口将唯一注入transport映射到stub，其余fetch禁止。

`VITE_DISCUSSION_DEMO=local-http` 只在该测试前端显示“真实适配器经本地 HTTP 替身验证”，不是Provider选择或调用授权。应用提示词见 `src/providers/discussion-prompt.ts`；规则及限制、真实开发Prompt、证据和待授权6B建议见 [6A验证记录](docs/stage-6a-validation.md)。私有配置、数据库、原始测试输出均不提交。

## 阶段6B：一次性真实短讨论入口

仅P14授权的一次验收，不能当作普通开发启动命令反复执行。固定项目`.local/stage-6b-live/discussions.sqlite`，授权在同目录`authorization/`，项目`.local/stage-6b-once.json`为不可覆盖锚点；不受当前工作目录影响，不复用4D。先完成并提交准备代码，再执行：

```powershell
npm run config:stage6b
npm run prepare:stage6b
npm run live:stage6b
# 单独前端终端；后端41882，前端41881，均loopback
$env:WEB_API_TARGET = 'http://127.0.0.1:41882'
$env:VITE_DISCUSSION_DEMO = 'live-short'
npm run dev:web -- --port 41881
# 服务就绪后仅执行一次；不得自动重跑
node scripts/stage6b-live-ui.mjs
```

安全检查仅报告非敏感设置及密钥是否配置；程序读取现有`.env.backend.local`，不修改它。prepare只接受不存在的固定目录/锚点，固定虚构阵容经原有校验、保存和确认。live要求准备时Git版本一致、独占数据库、绑定discussion/run；只开放该讨论start/stop写操作。页面标签明确预置阵容与真实讨论来源。开始后不得重新初始化、重置预算或更换run；观察仅GET/SSE。

2次专家发言、120秒普通、60秒收尾仅作用于受限run。默认仍12次/10分钟；003中技术预算B(2)=112保持，独立授权更严格限制为普通18+总结2。每次发送前不可变slot+fsync，取消/未知不返还；唯一总结task最多两次；一次适配器调用一次传输。终态/退出关闭授权并保留记录。未使用额度不能用于另一场；重启不续跑。`--read-only`浏览器恢复只GET/刷新，不点start。

本地回归命令`node scripts/stage6b-verify.mjs`不读私有配置或请求官方服务，含独立临时库/HTTP替身短流程；真实执行结果见[6B验证记录](docs/stage-6b-validation.md)。不要删除预算文件以清理环境，不提交验收数据库/原始授权记录。

本次6B授权已于2026-09-16 22:20:51（UTC+8）因启动就绪脚本错误中止并关闭，尚未开始讨论，官方请求0。不得再次运行prepare/start或删除关闭记录以补测。上述命令保留为实施说明，当前不构成再次调用授权。实际受阻原因、纯读取验收和后续需重新明确授权的边界见6B验证记录。
