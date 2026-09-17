# AI 圆桌讨论 Web App MVP

中文本地应用：创建话题 → 生成虚构阵容 → 用户确认 → 开始动态讨论 → 实时发言/状态/观点 → 总结与记录。前后端分离，SQLite持久化，HTTP操作与业务SSE；不播放预生成整场剧本。

**默认Fake、无需密钥。** 历史真实证据：4D一次阵容；6B原验收受阻且0请求；6B-R1预置阵容下两次专家发言、一次合法空提炼、9次真实请求。它们是独立记录；授权均关闭，不得重开或补跑。详见[总交付报告](docs/delivery-validation.md)。

## 验收方快速开始（默认 Fake，无需密钥）

安装官方 Node.js **>=24.16.0 且 <25**（推荐已验证的24.16.0），并确保能访问npm包仓库。解压或克隆后，在包含package.json的根目录打开终端；路径可自行选择，不依赖开发者的D盘。无需单独安装SQLite、Python、Git（ZIP运行时）或全局前端工具。

在仓库根目录执行。正式应用只有根package.json/package-lock.json；web使用同一依赖，tools/env-probe是历史实验，不需安装它来运行应用。

以下命令适用于PowerShell、CMD、macOS/Linux终端，逐条运行；失败时先处理提示，不跳过失败步骤。

```text
node scripts/check-environment.mjs
npm ci --ignore-scripts --no-audit --no-fund
npm run setup
npm start
```

环境检查可在安装依赖前执行，只检查Node和SQLite内存读写，不读取私有配置或打开应用库。setup核对锁定依赖、编译前后端、初始化数据库并导入五组样例；已有数据不覆盖，再次执行前先停后端。默认库为data/discussions.sqlite，不使用历史.local验收库。安装禁止生命周期脚本，不使用全局包或Codex缓存，不删除锁文件或升级依赖掩盖失败。

另开终端，在同一根目录：

```powershell
npm run dev:web
```

访问 http://127.0.0.1:5173 。后端默认 http://127.0.0.1:3000 ，只监听回环。确认页脚阵容与讨论均为Fake，再按创建、生成阵容、确认、开始、结束和刷新操作；也可查看预置样例。两个终端各按Ctrl+C关闭。默认不加载任何.env文件；仅存在密钥不会选择真实Provider。若终端已有Provider、DATABASE_PATH或PORT变量，先核对，初次验收建议使用默认设置。

### 环境范围与准备问题

- 已实测Windows10、Node24.16.0及锁定依赖；此前Edge通过，本轮Chromium结果见[验收环境改进记录](docs/delivery-validation.md#验收环境便利性改进)。Windows11、macOS、Linux尚未实际复验，不能标为通过；在各自系统重新安装依赖，不复制其他电脑的node_modules。
- 人工访问页面不强制Edge。自动化测试默认Playwright Chromium，可选择已安装的Edge/Chrome；浏览器安装另有[官方系统要求](https://playwright.dev/docs/intro#system-requirements)，Windows10本机成功不等于官方支持认证。
- 找不到node/npm时，安装指定Node并重新打开终端；PowerShell若拦截npm.ps1，可用npm.cmd执行相同命令，无需修改全局执行策略。
- `npm ci`失败先检查网络/代理，不能用force或删除锁文件解决；`node scripts/check-environment.mjs --dependencies`检查依赖，详细差异见`node scripts/check-dependencies.mjs`。
- 端口或数据库占用时按下文维护说明处理，不结束未知进程、不删除未知锁或数据库。

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

人工使用应用不必下载测试浏览器。运行E2E前，安装项目Playwright版本对应的Chromium（会下载浏览器及配套资源，不装全局工具），再检查实际启动能力：

```text
node node_modules/playwright/cli.js install chromium
npm run check:browser
npm test
npm run test:web
npm run test:e2e
npm run test:e2e:local-adapter
npm run typecheck
npm run typecheck:web
npm run typecheck:e2e
npm run typecheck:startup
npm run typecheck:tools
npm run build:startup
npm run rehearse:stage6b
```

Linux缺少浏览器系统依赖时，可由验收者按需执行 `node node_modules/playwright/cli.js install --with-deps chromium`，可能需要管理员权限并安装系统包；项目不会自动执行。参考[官方浏览器安装说明](https://playwright.dev/docs/browsers#install-system-dependencies)。离线或受限机器需要事先准备下载访问，不能承诺离线首次安装。

若使用已安装的Edge，可跳过Chromium下载：PowerShell先执行 `$env:E2E_BROWSER="msedge"`，CMD执行 `set E2E_BROWSER=msedge`，macOS/Linux执行 `export E2E_BROWSER=msedge`，再运行check:browser和测试。Chrome对应值为`chrome`；恢复默认设为`chromium`。未知值报错，不会静默改用其他浏览器。

Vitest网络边界只允许本机；Fake E2E和HTTP替身入口明确注入替身，重试为0，不读私有配置。rehearse:stage6b运行本地HTTP替身，使用当前浏览器选择，不是旧真实验收入口。E2E使用41861/41862，HTTP替身41871/41872，启动彩排41881/41882，交付冒烟41901/41902。占用即失败，不复用未知服务；请顺序运行。

历史交付辅助脚本delivery-verify/delivery-smoke与记录保留，详情见交付报告；重新执行时不要覆盖历史证据。setup只负责准备，以上测试属于进一步验收，不要求普通用户每次启动都执行。

干净目录可重新克隆、解压交付ZIP或从指定提交git archive导出；不复制node_modules/.env/.local/数据库/构建物，按上述锁文件安装。ZIP及源码快照不含Git历史，完整历史通过GitHub仓库查阅。

## 文档与限制

[唯一需求/交付检查表](docs/requirements.md) · [架构/ER/状态图](docs/architecture.md) · [运行设计](docs/discussion-runtime-design.md) · [界面](docs/ui-spec.md) · [测试计划](docs/test-plan.md) · [真实Prompt精选索引](docs/sources/development-prompts.md#阶段7精选开发prompt索引) · [工作流说明](docs/workflow.md) · [过程记录](docs/development-log.md) · [交付验证](docs/delivery-validation.md)。

实现了完整Fake核心用户流程与真实适配器、本地契约测试；真实证据仅各一次独立阵容和短讨论。R1空提炼未验证非空观点真实语义支持；引用存在不证明内容成立。长期质量、跨平台、移动真机、生产负载和完整辅助技术检查未验证。后续应独立授权质量评估及更广环境测试，不自动增加账户/音视频/云部署。
