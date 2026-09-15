# 阶段1B：最小开发与测试环境验证

执行日期：2026-09-15。根目录 `D:\实测文件夹`，实验目录 `D:\实测文件夹\tools\env-probe`。本报告记录实际执行结果；不是规划报告，也不证明业务功能、产品E2E、模型性能或成本。

## 结论

五组最小环境验证均已实际执行并通过各自断言。Vitest正常运行9/9，故意反向断言时1失败/8通过、退出码1，随后恢复正常模式9/9、退出码0。Playwright持久化测试在既有Edge headless独立上下文中1/1通过，无需下载Chromium。未执行产品测试T01–T20或真实模型调用。

**Windows 10 本机实验，不属于官方支持认证。** 当前官方要求Windows 11+、受支持Windows Server或Linux/WSL；本机实验成功不改变此边界。[Playwright系统要求](https://playwright.dev/docs/intro#system-requirements)

## 版本、来源与安装

| 项目 | 实际值 | 证据 |
|---|---|---|
| OS | Windows 10家庭版64位，10.0.19045 | runtime.json |
| Shell | PowerShell Core 7.6.5 | runtime.json |
| Node | v24.16.0，D:\nodejs\node.exe | runtime.json、12-provenance-with-sqlite.json |
| npm | 11.13.0，D:\nodejs\node_modules\npm\bin\npm-cli.js | runtime.json、01-install-ignore-scripts.json |
| SQLite | Node内置模块，SQLite 3.53.0 | dependency-provenance.json；8项真实文件库断言 |
| React / ReactDOM | 19.3.0 / 19.3.0 | npm-metadata.json、dependency-provenance.json |
| TypeScript | 7.0.2，官方Windows平台编译器同版本 | 同上；lock-source-summary.json |
| Vite / Express | 8.3.0 / 5.2.1 | 同上；前后端构建及HTTP证据 |
| Vitest | 5.0.1 | 07/08/10号运行记录 |
| @playwright/test | 1.63.0，playwright/playwright-core匹配该锁定版本 | package-lock.json、09-browser-edge.json |
| 类型包 | @types/node 24.13.4；@types/react及react-dom 19.3.0；@types/express 5.0.6 | dependency-provenance.json |
| 浏览器 | Edge 153.0.4234.32；msedge通道；headless | browser.json、09-browser-edge.json |

证据文件均在[实验evidence目录](../tools/env-probe/evidence/)。直接依赖11项均通过真实解析路径验证，全部来自本实验包node_modules。没有使用全局React/Vite或Codex私有缓存的项目包；Node使用实际系统路径。

选择前查询官方npm元数据，保存版本、engines、peerDependencies及可选peer标记，没有从记忆填写版本、没有采用预发布版。ReactDOM与React匹配，Vitest5支持Vite8/Node24，Node类型选择24系列。安装启用engine-strict，未使用force/legacy-peer-deps；npm ls --depth=0退出0。锁文件版本3，所有resolved下载主机为registry.npmjs.org。具体完整元数据在npm-metadata.json。

本次下载127个npm依赖包（含传递依赖及必需平台配套），安装退出0。官方平台包包括TypeScript win32-x64 7.0.2、Rolldown binding win32-x64-msvc 1.2.8、Lightning CSS win32-x64-msvc 1.33.0。未下载浏览器、未安装系统编译工具、未修改全局Node/npm/PATH/代理/证书。

### 生命周期脚本审查

先使用--ignore-scripts安装。扫描已发布包清单找到content-type 2.1.0、lightningcss 1.33.0、path-to-regexp 8.4.2、tinyexec 1.3.0的prepare声明（部分重复位于不同依赖路径），没有为本实验开启它们；已发布构建产物和官方平台包足以完成验证。没有额外执行安装/重建脚本，没有全局修改或额外系统程序安装。

实际执行的是局部TypeScript/Vite/Vitest/Playwright入口与本项目探针；脚本用途和未执行的prepare声明见install-script-inventory.json、script-review.json。此处仅是安装入口与必要行为检查，**不是全面供应链安全审计**。npm提示可升级至12.0.2只是安装日志提示，本轮没有执行该建议。

## 五组验证及实际证据

全部命令工作目录：`D:\实测文件夹\tools\env-probe`。下表的Node程序均为 `D:\nodejs\node.exe`，由PowerShell `scripts/run-check.ps1` 启动，记录完整argv、cwd、起止UTC时间、限定超时、退出码、stdout/stderr。文件名相对于实验evidence目录。

| 组别/目的 | 实际Node命令参数 | 退出码/关键结果 | 结论与证据 |
|---|---|---|---|
| A 安装并限制脚本 | D:\nodejs\node_modules\npm\bin\npm-cli.js install --ignore-scripts --no-audit --no-fund --fetch-retries=1 --fetch-timeout=60000 | 0；added 127 packages in 35s | 通过；01-install-ignore-scripts.json；总超时240秒 |
| A 运行时/依赖来源 | scripts/provenance.mjs | 0；11项精确版本及本地解析路径匹配；SQLite3.53.0 | 通过；02-dependency-source.json、12-provenance-with-sqlite.json；30秒 |
| A 依赖树 | D:\nodejs\node_modules\npm\bin\npm-cli.js ls --depth=0 | 0；11个直接依赖均列出 | 通过；11-npm-tree.json；30秒 |
| B 类型检查 | node_modules/typescript/bin/tsc -p tsconfig.json | 0；无类型错误 | 通过；03-typecheck.json；60秒 |
| B 前端构建 | node_modules/vite/bin/vite.js build | 0；14 modules transformed，dist/client产物 | 通过；04-build-client.json；90秒 |
| B 后端编译 | node_modules/typescript/bin/tsc -p tsconfig.server.json | 0；dist/server/index.js生成 | 通过；05-build-server.json；60秒 |
| B 后端启动/HTTP | scripts/http-smoke.mjs | 0；HTTP200，ok=true，message为“本地后端已连接”；探针关闭自己启动的后端 | 通过；06-http-health.json；30秒 |
| C SQLite文件库 | node_modules/vitest/vitest.mjs run --config vitest.config.ts | 0；sqlite.test.ts的8项断言通过 | 通过；07-unit-sqlite.json、10-unit-restored.json及持久化测试源文件 |
| D Vitest正常发现 | 同上 | 0；2个文件，9个测试通过；不包含浏览器spec | 通过；07-unit-sqlite.json；60秒 |
| D 反向自检 | scripts/negative-runner.mjs | **1**；expected 4 to be 5，1失败/8通过 | 工具自检通过：观察到预期失败；实际运行结果为失败，保留08-intentional-negative.json；75秒 |
| D 恢复正常断言 | node_modules/vitest/vitest.mjs run --config vitest.config.ts | 0；2个文件，9/9通过 | 通过；10-unit-restored.json；反向标志只存在于上一子进程，无源码/父环境残留 |
| E 浏览器本机实验 | node_modules/@playwright/test/cli.js test --config playwright.config.ts | 0；1测试通过；Edge153.0.4234.32，msedge，headless | 通过本机可行性实验；09-browser-edge.json、browser.json；90秒 |

OS和Shell由PowerShell Get-CimInstance Win32_OperatingSystem、$PSVersionTable.PSVersion取得；Node/npm由实际可执行命令取得，采集命令退出0，保存runtime.json。官方元数据查询使用Python urllib直接读取公共registry URL，不读取npm认证配置；准确来源URL和查询时间保留在npm-metadata.json。

### C组：SQLite断言具体范围

独立数据库位于实验目录 `.tmp/数据库-*/环境探针.sqlite`；不创建业务表。每项测试使用自己的文件并在结束时关闭连接，不清理其他目录。

1. 中文路径、中文字符串以及包含单引号/双引号/SQL片段的文本，参数绑定后原样读回。
2. 重复主键被拒绝。
3. 重复唯一字段被拒绝。
4. PRAGMA foreign_keys=1，真实拒绝孤儿外键。
5. 父子两条记录在成功事务中提交。
6. 事务中故意制造外键失败，ROLLBACK后先前写入计数为0。
7. 数据库关闭、重开后仍能读取已提交的中文内容。
8. 文件库PRAGMA journal_mode=WAL实际返回wal。

这些断言支持继续保留node:sqlite候选，无须切换驱动或语言。对应Node24.16文档仍标为Stability 1.2 Release candidate，且同步操作需要保持事务短小；本轮未验证多进程并发、生产可靠性或产品级事务设计。[对应版本SQLite文档](https://nodejs.org/download/release/v24.16.0/docs/api/sqlite.html)

### E组：浏览器范围与限制

测试通过真实HTTP访问Vite构建后的React页面；检查中文标题，点击按钮使“操作次数：0”变为“操作次数：1”，并断言页面通过代理读取真实Express后端的中文响应。没有page.setContent、业务API mock、静态截图替代服务或networkidle/固定sleep完成条件。页面未发生pageerror。

使用已存在的 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，新建临时测试上下文；没有接入日常profile、登录态或标签页。临时目录限定在实验.cache/tmp，备用浏览器缓存路径统一为.cache/browsers。Edge成功，因此Chromium备用路线、Chrome路线均**未执行**，不是失败或通过。

截图在evidence/screenshots/environment.png（已人工查看，正文、操作次数1、后端已连接均可见）；原始Playwright JSON报告在evidence/raw/playwright-report.json。两者属于生成产物并被Git忽略；精简执行证据与browser.json保留。

未增加SSE探针，本轮健康请求已足以验证两端访问。SSE、重连、多讨论隔离、真实模型和产品完整E2E均未执行。Playwright日志有NO_COLOR/FORCE_COLOR同时设置的提示，属于颜色输出提示，退出码0且所有断言成功；没有据此改全局环境。

## 进程与缓存收尾

HTTP检查自己启动的后端PID12912已关闭；浏览器测试由Playwright webServer启动的后端PID23012也已退出。复查41731/41732无监听，按env-probe命令行限定筛选的Node/Edge进程均为空。见cleanup.json和owned-process-check.json。没有用按进程名全量终止的方式清理。

缓存、测试库和浏览器临时数据保留在本实验.cache/.tmp下，未删除用户已有缓存。源码、锁文件、运行说明和小体积证据可纳入未来提交；node_modules、构建物、数据库、浏览器二进制、大体积报告及截图均忽略。

## 文档修订、真实留痕与Git

- 保持R01–R32编号稳定，D01/D02/D07按用户确认修订为第一版默认值；总结暂1–2句，长总结仍待出题方解释；单层重试及60秒收尾包含排队/调用/重试。
- 仅确实中断的running/stopping标记失败，草稿/待确认/已完成不误伤；generating_lineup回created属于明确保留的C类细节，不伪称用户已规定。
- 新授权Prompt按原文追加，未重写旧Prompt、阶段0报告或题面。历史原文与前缀哈希在最终文档检查复核。
- 没有用户明确确认的提交署名/邮箱，因此没有阶段1A基线提交，也没有实验提交。Git仍在main、没有commit、没有暂存和远程；身份只阻塞提交，不阻塞已完成的环境验证。

### 文档收尾检查的真实问题

首次文档辅助检查退出1：KeyError指向docs/sources/development-prompts.md。基线清单来自Windows Path，键使用反斜杠，检查逻辑却按正斜杠查找；已保存最小复现和实际键列表到document-check-initial-failure.json，并使用现有systematic-debugging流程定位。仅统一比较键分隔符，不修改基线或原文哈希；持久化辅助脚本scripts/check-documents.py复验退出0。该脚本使用已有Python标准库，属于可选文档审计辅助工具，不是应用运行依赖。

最终文档检查保持32个唯一需求编号、20个产品用例全部为计划，12条环境执行记录符合预期退出码，旧Prompt归档前缀与阶段0原文哈希不变，锁文件匹配直接依赖，生成产物正确忽略。见final-checks.json及file-changes.json。这不是产品测试或全量安全扫描。

## 未解决项与下一步

没有阻塞本轮最小环境验证的未解决失败。官方支持环境尚未验证，不阻塞在本机继续小步开发，但最终交付的可复现支持范围仍须明确。模型资料及工具口径冲突继续待确认，前者在真实接入前解决，后者关系最终作业合规；均不能靠本轮探针证明。

建议下一阶段只确定一个业务纵向切片的验收与任务拆分，例如“讨论草稿数据模型和输入运行时校验”；经用户授权后才开展真实失败测试→最小实现→通过验证。不要整体迁入环境探针，也不直接生成完整应用。

阶段1B到此停止，等待下一阶段授权。


## 阶段2引用说明

本报告保留阶段1B实测证据；阶段2使用其精确版本在项目根目录重新生成正式锁文件并独立安装，不使用探针node_modules。正式草稿业务验证见[阶段2验证记录](stage-2-validation.md)，不合并到本报告的环境测试数量。
