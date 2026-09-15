# 阶段1B环境验证样本

这是独立实验包，不是正式应用、产品E2E或样例讨论数据。仅有React中文页面、点击计数、真实Express健康接口、通用SQLite测试和测试运行器检查；没有业务表、讨论API、模型接入或调度实现。

## 运行前提与依赖

本次使用系统 `D:\nodejs\node.exe`（24.16.0）、npm 11.13.0；依赖全部从本目录node_modules解析。精确版本见package.json/package-lock.json及evidence/dependency-provenance.json。类型检查使用TypeScript 7发布包及其官方Windows平台编译器，不需要系统C++编译器。

本次只执行 `npm install --ignore-scripts --no-audit --no-fund` 及限定下载超时/重试参数；没有开启安装生命周期脚本。未来按锁文件复现可在本实验目录运行 `npm ci --ignore-scripts --no-audit --no-fund`，本轮未额外执行npm ci。不能把Codex缓存加入NODE_PATH或借用其项目包。

所有复现实验均应从 `D:\实测文件夹\tools\env-probe` 执行，使用PowerShell 7及 `scripts/run-check.ps1`。该脚本记录程序、参数、cwd、起止时间、退出码和输出；每次使用新Name，拒绝覆盖已有证据。超时仅终止其自行启动的进程树。

例如（这是复现示例，不是额外执行记录）：

```powershell
Set-Location -LiteralPath 'D:\实测文件夹\tools\env-probe'
& .\scripts\run-check.ps1 -Name 'rerun-typecheck' -Program 'D:\nodejs\node.exe' -CommandArgs @('node_modules/typescript/bin/tsc','-p','tsconfig.json') -TimeoutSeconds 60
```

## 验证入口

以下npm脚本均调用本包局部CLI；实际已执行命令及退出码以evidence/编号JSON为准。

| 入口 | 用途 |
|---|---|
| npm run check:source | 核实所有直接依赖的精确版本与真实本地解析位置 |
| npm run typecheck | 前端、后端、配置与测试源文件严格类型检查 |
| npm run build:client | Vite前端构建到dist/client |
| npm run build:server | Express TypeScript编译到dist/server |
| npm run check:http | 启动本包编译后端，断言HTTP 200与中文JSON；finally关闭自己的子进程 |
| npm run test:unit | 只发现tests/unit/**/*.test.ts，共8项SQLite检查及1项运行器断言 |
| npm run test:negative | 仅子进程设置反向断言标志，预期退出码1；这不是业务TDD |
| npm run test:browser | 在已构建后端/前端上执行tests/browser/*.spec.ts；默认独立headless Edge |

顺序：依赖来源→类型检查→两端构建→HTTP→正常单元→反向运行器→恢复正常单元→浏览器。构建与独立单元可分开运行，浏览器必须使用已构建结果。没有固定sleep或networkidle就绪判断，没有skip/only或无测试也通过设置。

## 服务与浏览器隔离

- Express：127.0.0.1:41732，仅/probe/health。Vite preview：127.0.0.1:41731，代理/probe到后端；页面读取真实后端响应。
- Playwright的两个webServer配置禁止reuseExistingServer，不复用未知端口服务。测试框架启动并负责关闭这些进程；HTTP探针独立管理自己的后端进程。
- 默认 `msedge` 通道，使用Playwright临时上下文，不调用connectOverCDP或launchPersistentContext，不接触日常浏览器资料。
- 本轮Edge路径已可用，因此没有执行浏览器下载。若未来确认Edge不可用，可将仅该进程的ENV_PROBE_BROWSER改为chrome（存在时）或按授权下载匹配的Chromium；不得安装覆盖系统Edge/Chrome。
- `run-check.ps1`为子进程统一设置PLAYWRIGHT_BROWSERS_PATH为本包.cache/browsers，TEMP/TMP为.cache/tmp，npm cache为.cache/npm，userconfig/globalconfig为本包空配置文件，registry为官方npm。配置变更不影响全局或其他进程。
- 本次结论固定标为“Windows 10 本机实验，不属于官方支持认证”。成功不等于受支持环境、全浏览器兼容或产品E2E验证。

## 产物与证据

- 保留：源文件、配置、锁文件、小体积evidence/*.json及jsonl、本文、主报告。
- 忽略：node_modules、dist、.cache（npm/浏览器/临时profile）、.tmp（本轮独立测试库）、evidence/raw、evidence/screenshots。
- 数据库路径有中文，表仅sample_parent/sample_child；测试不删除旧库，各次运行生成独立目录并在测试后关闭连接。无并发/生产可靠性结论。
- 不执行自动清理。以后若需要清理，只能针对经确认的本包上述生成目录，不触碰用户已有缓存或其他进程。

主结果：[environment-validation.md](../../docs/environment-validation.md)。预期反向失败证据必须保留，正常复验结果另记，不能覆盖失败记录。

