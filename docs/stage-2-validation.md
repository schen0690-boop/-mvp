# 阶段2：讨论草稿真实TDD与验证记录

执行日期：2026-09-15。项目根目录：`D:\实测文件夹`。原始时间与每条命令退出码见 `evidence/stage-2/*.json`（UTC），不是倒填阶段记录。当前Git身份未由用户明确提供，无提交；以下证据不能替代尚未形成的Git演进历史。

## 范围与结果

完成输入校验→创建created草稿→真实SQLite草稿/首事件原子提交→单条/列表查询→关闭重开读取。参数绑定，服务端UUID/UTC时间，白名单公开快照；不存在记录404、输入400、幂等冲突409、脱敏内部500。无模型、前端、阵容、运行调度、SSE或完整产品E2E。

正式工程位于根package及src/tests；tools/env-probe保持独立。本轮本地安装118个包，直接依赖采用1B精确版本，安装禁用生命周期脚本；未安装React、Playwright、ORM或Agent框架。Vite 8.3.0作为Vitest运行依赖保留，未生成前端。模块解析与锁文件、实际包版本核对通过，见18和22。

## 真实TDD步骤

| 行为 | 实际RED证据（退出1） | 最小实现与GREEN证据（退出0） |
|---|---|---|
| 运行时输入 | 02最初38项失败；发现Vitest空数组参数会被展开，先改测试数据包装；02b同组38项因空返回值/未拒绝非法输入失败 | 03同组38项通过；只实现运行时校验与安全领域错误 |
| SQLite初始化 | 04：schema断言期望两表，实际空数组，1项失败；非缺依赖或SQL语法错误 | 05：创建两必要表/约束/外键，累计39项通过 |
| 创建/查询/幂等/事件事务/重开 | 06：13项失败，明确Draft creation/lookup尚未实现；事件故障例要求到达真实触发器失败，不接受任意throw作为通过 | 07：服务、存储适配、参数绑定、事务、公开投影完成，累计52项通过 |
| 列表 | 08：7失败、1空态已通过；创建后all仍为空、未拒绝非法过滤 | 09：查询与排序/白名单，累计60项通过 |
| HTTP请求与错误边界 | 10：18项失败，Express尚无业务路由，创建请求得到404而非201 | 11：真实路由/解析限制/错误中间件完成，累计78项通过 |
| Unicode存储边界修正 | 15：新增NUL前缀话题用例，1失败13通过，失败来自SQLite长度约束 | 16先确认根因；17修正存储长度保护，同组及回归79项通过 |

证据JSON保留实际命令、stdout/stderr、起止时间、退出码、src/tests的SHA-256。没有使用探针反向断言；没有把依赖错误算业务RED；所有失败记录保留，未覆盖为成功。TDD测试骨架先可运行，再执行RED，再最小实现；启动/记录脚本属于验证支撑，不声称每行配置都经过业务TDD。

### 实际修正：Unicode码点和SQLite文本长度

`\u0000中文`按业务规则为3码点，本机SQLite `length(?)`返回0，而字节数为7。SQLite文本length只统计第一个U+0000之前的码点，与此次故障相符。[SQLite官方length说明](https://www.sqlite.org/lang_corefunc.html#length)。业务层继续严格校验1–500码点；数据库改为1–2000字节存储保护，正常中文、emoji及引号规则保持一致。变更前只有本轮独立临时库，没有用户开发库迁移；旧临时证据库原样保留。

## 最终验证

| 检查 | 实际命令（从项目根目录） | 结果 | 退出码/证据 |
|---|---|---|---|
| 类型检查 | npm run typecheck | src、tests、Vitest配置严格检查通过，无as any/关闭类型检查 | 0；19-final-typecheck |
| 正式编译 | npm run build | src输出至dist | 0；23-final-build |
| 单元 | node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/unit | 38通过 | 0；20-final-unit |
| SQLite与HTTP集成 | node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/integration | 41通过（schema1、草稿14、列表8、HTTP18） | 0；21-final-integration |
| 完整业务回归 | npm test | 5测试文件、79通过，无探针测试 | 0；24-final-regression |
| 依赖独立性 | node scripts/check-dependencies.mjs；npm ls --depth=0 | 声明/锁文件/已安装版本一致；全部正式模块在根node_modules | 均0；18、22 |
| 独立进程实测 | node scripts/http-smoke.mjs | 两次初始化0；POST201、GET200、列表200、重启GET200；两次正常退出0、监听关闭 | 0；25-final-process-smoke |

独立进程验证启动的是dist/server.js，Windows脚本包装器仅将父进程IPC转为服务正常SIGTERM关闭路径；生产代码不包含测试专用HTTP关闭接口或测试IPC。启动完成以真实监听日志为条件，接口以状态与正文断言；没有固定休眠当成功条件。临时端口由本机空闲端口分配，若探测与绑定间被占用，明确失败而非抢占其他服务。

文件/敏感内容/历史来源检查另由 `scripts/check-project.py` 输出 `26-final-files.json`。检测高置信度密钥形态，不读取配置或真实密钥；这不是完整安全审计。全部变更文件索引与历史前缀/探针哈希核验包含于该记录。

## 交付与限制

- 新增根package.json/lock、TS/Vitest配置、README；src中9个TS文件；tests中5个测试文件与1个临时库辅助文件；scripts运行/核验工具；本报告与命令证据。
- 修改AGENTS、.gitignore、requirements/architecture/contracts/test-plan、environment-validation追加关联说明、development-log追加本轮记录；development-prompts仅追加P3，原文前缀不改。阶段0报告与探针保留。
- 草稿/schema约束刻意限定当前阶段；后续生命周期需非破坏迁移。未实现跨进程拥有权锁、高并发/磁盘故障恢复、运行态恢复、真实模型或完整E2E。
- SQLite node:sqlite的阶段1B稳定性结论及Win10/Playwright官方支持风险仍保留；本轮通过不等于生产认证。未运行npm漏洞审计，也未跨系统重装验证。
- Git main尚无commit、无暂存、无远程；身份只阻塞提交。未修改全局配置或升级工具；安装日志中的npm升级提示未执行。
- 下一阶段仅建议另行授权“阵容生成契约及受控模型边界的TDD”，先确定提供商协议与生命周期迁移，再实现；本轮到此停止。
