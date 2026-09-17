# AI 圆桌讨论 Web App MVP

中文本地应用：创建话题 → 生成虚构阵容 → 用户确认 → 开始动态讨论 → 实时发言/状态/观点 → 总结与记录。前后端分离，SQLite持久化，HTTP操作与业务SSE；不播放预生成整场剧本。

**默认Fake、无需密钥。** 历史真实证据：4D一次阵容；6B原验收受阻且0请求；6B-R1预置阵容下两次专家发言、一次合法空提炼、9次真实请求。它们是独立记录；授权均关闭，不得重开或补跑。详见[总交付报告](docs/delivery-validation.md)。

## 实测环境与安装

Windows 10、Node.js 24.16.0、npm 11.13.0、已安装Microsoft Edge独立测试上下文。Windows其他版本、Linux/macOS、移动真机未验证；移动视口不是移动真机认证。Node要求`>=24.16.0 <25`（node:sqlite）。

在仓库根目录执行。正式应用只有根package.json/package-lock.json；web使用同一依赖，tools/env-probe是历史实验，不需安装它来运行应用。

```powershell
npm ci --ignore-scripts --no-audit --no-fund
node scripts/check-dependencies.mjs
npm run typecheck
npm run typecheck:web
npm run typecheck:e2e
npm run typecheck:startup
npm run build
npm run build:web
npm run build:startup
npm run db:init
npm run db:seed
npm start
```

安装仅使用锁定依赖并禁生命周期脚本，不使用全局包、探针或Codex缓存。禁止用force、升级版本或打开未知安装脚本掩盖安装失败；`check-dependencies`核对版本和本目录解析路径。浏览器测试使用现有Edge，不自动下载浏览器。

另开终端，在同一根目录：

```powershell
npm run dev:web
```

访问 http://127.0.0.1:5173 。后端默认 http://127.0.0.1:3000 ，只监听回环。两个终端各按Ctrl+C关闭。默认不加载任何.env文件；仅存在密钥不会选择真实Provider。

### 五组可见样例

`npm run db:seed`离线导入[五组人工预置阵容](src/sample-data.ts)：教育、公共空间、工作制度、数字展览、食物减废；分别2/3/2/3/4位专家，另加一主持。名称与话题明确标注虚构/预置，不是五次真实模型成绩。

首页选择“全部讨论”（待确认样例也在进行中筛选），点击带“预置样例”的话题查看成员。导入只停在awaiting_confirmation，用户仍须确认并点击开始。稳定requestId使重复导入不新增、不覆盖已有或已确认记录；整批事务失败回滚，不写发言。导入前先停后端，初始化不会自动导入样例。

## Provider与密钥（不自动授权或执行）

| 后端变量 | 默认/规则 |
|---|---|
| DATABASE_PATH | data/discussions.sqlite；相对当前根目录，初始化/启动/导入须一致 |
| PORT | 3000，合法端口；绑定127.0.0.1 |
| ROSTER_PROVIDER | fake 或 deepseek，默认fake |
| DISCUSSION_PROVIDER | 独立fake 或 deepseek，默认fake |
| DEEPSEEK_API_KEY | 仅后端本地填写；不可发送到聊天、前端或Git |
| DEEPSEEK_BASE_URL / MODEL | 固定 https://api.deepseek.com / deepseek-flash |
| DEEPSEEK_MAX_TOKENS | 阵容固定4096；讨论意愿512/发言768/提炼4096/总结1024 |
| WEB_API_TARGET | 前端代理目标，默认http://127.0.0.1:3000；只用于Vite后端代理 |

配置范本[.env.backend.example](.env.backend.example)。需要使用真实Provider时，在自己的本地副本填写密钥、显式选择两种Provider；.env.backend.local已忽略，不提交。没有配置时不得从历史验收数据库或其他账户获取凭据。

普通真实模式已接线，与一次性历史验收入口无关。**以下为用户自行明确决定使用真实模型时的运行方式，本轮未执行：**

```powershell
# 本地编辑私有文件后，显式加载到后端环境；不打印文件内容
node --env-file=.env.backend.local dist/server.js --allow-real-models
```

deepseek选择必须同时给出`--allow-real-models`，否则启动失败；缺密钥/错误模型/失败不会静默切回Fake。构造Provider、打开页面及GET不会调用模型；点击生成阵容或开始讨论后可能产生费用。正常限制为12次专家发言/10分钟、收尾60秒、单调用30秒、每场B(N)=28N+56含总结2次；这些是技术上限，不是费用额度或用户授权。结束可能仍需一次总结；取消不保证供应商不计费。普通真实模式仅本地HTTP替身验证，未消耗任何新的真实额度。

页面从GET /api/config读取阵容/讨论模式；读取失败显示模式未知，不误称Fake。历史local-http/live-short标签仅供固定测试入口，日常启动不要设置VITE_DISCUSSION_DEMO。不要把密钥放入VITE_*变量。

### 历史验收入口：全部已关闭

4D、6B、R1的prepare/live/launch脚本和记录保留审计，不是日常启动方式；不得重新初始化授权、删除锚点、换库获得余量。阶段7无官方请求。正常运行使用自己的data库，不依赖任何固定discussion ID或.local验收库。

## 数据库维护与安全故障处理

`db:init`显式001→002→003；未知schema拒绝，失败回滚。已有旧库升级前自动创建独占备份并检查完整性；先停止全部写入者。启动不自动迁移。不要以删库代替升级。

- 端口占用：检查实际占用者，改PORT/WEB_API_TARGET及前端`--port`配对；不误杀未知进程。
- 数据库锁：同一文件仅一个后端。先正常停止；异常遗留.owner须核实路径及记录PID确已退出后才人工处理，不自动抢占或清空库。
- 配置错误：核对公开模式、必需变量及固定模型/地址，保持私有文件不输出；不要切Fake冒充真实成功。
- 重启：保留历史；只将中断的生成/运行标失败，不自动续跑请求。已结束讨论不可再次开始。
- 仅限本机可信使用；未实现账户/互联网部署防护，不能直接暴露到公网。

## API和技术选型

React 19.3.0/Vite 8.3.0/TypeScript 7.0.2；Express 5.2.1；SQLite内置驱动；Vitest 5.0.1与项目Playwright 1.63.0。精确版本见锁文件。

| API | 用途 |
|---|---|
| GET /api/config | 两种Provider名称，不含密钥/地址/预算 |
| POST /api/discussions | topic、expertCount、requestId，创建草稿 |
| GET /api/discussions?status=all或active | 列表，updatedAt降序/id升序 |
| GET /api/discussions/{id} | 公开一致快照 |
| POST /api/discussions/{id}/lineup | 生成/重新生成；请求幂等和代次检查 |
| POST /api/discussions/{id}/lineup/confirm | 确认generationId/lineupRevision，不启动 |
| POST /api/discussions/{id}/start | 绑定已确认版本，只创建一个runner |
| POST /api/discussions/{id}/stop | 空对象{}，一次有限收尾 |
| GET /api/discussions/{id}/events?after=游标 | SSE，讨论内事件号、完整事务批次、重连去重 |

输入/错误/快照/重连完整定义见[API/SSE契约](docs/contracts.md)。JSON仅为传输，页面不显示原始响应或隐藏推理。

## 本地测试与复现

```powershell
npm test
npm run test:web
npm run test:e2e
npm run test:e2e:local-adapter
npm run rehearse:stage6b
# 对应交付的完整顺序验证（自动分配测试库、保存报告）
node scripts/delivery-verify.mjs
# 已初始化并导入样例后，正式默认入口+浏览器+停服重开冒烟
node scripts/delivery-smoke.mjs
```

Vitest网络边界只允许本机；Fake E2E和HTTP替身入口明确注入替身，重试为0，不读私有配置。整套验证脚本清除继承模型配置并安装子进程网络保护。E2E使用41861/41862，HTTP替身41871/41872，启动彩排41881/41882，交付冒烟41901/41902。占用即失败，不复用未知服务。测试库在.tmp；记录在evidence/stage-7。不要并行运行占用相同端口的验证。

干净目录应来自指定提交的`git archive`，不复制node_modules/.env/.local/数据库/构建物；按上述锁文件安装和命令执行。源码快照没有Git历史，不是完整源码仓库交付；完整历史在原Git仓库。

## 文档与限制

[唯一需求/交付检查表](docs/requirements.md) · [架构/ER/状态图](docs/architecture.md) · [运行设计](docs/discussion-runtime-design.md) · [界面](docs/ui-spec.md) · [测试计划](docs/test-plan.md) · [真实Prompt精选索引](docs/sources/development-prompts.md#阶段7精选开发prompt索引) · [工作流说明](docs/workflow.md) · [过程记录](docs/development-log.md) · [交付验证](docs/delivery-validation.md)。

实现了完整Fake核心用户流程与真实适配器、本地契约测试；真实证据仅各一次独立阵容和短讨论。R1空提炼未验证非空观点真实语义支持；引用存在不证明内容成立。长期质量、跨平台、移动真机、生产负载和完整辅助技术检查未验证。后续应独立授权质量评估及更广环境测试，不自动增加账户/音视频/云部署。

仍需出题方确认Codex与题面Claude Code/Deepseek V4 Pro口径差异；不虚构工具使用。源码与完整历史已发布至[GitHub schen0690-boop/-mvp](https://github.com/schen0690-boop/-mvp)，匿名评阅访问及远程完整克隆已核验。排除提交方式不免除源码仓库链接这一第三部分交付要求。
