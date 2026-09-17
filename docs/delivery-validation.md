# 阶段7交付核对与干净目录复现

## 范围与判定方式

只核对原题前三部分。题面原图本轮再次目视读取，第三部分仓库链接要求保留，第四部分提交方式不纳入。唯一逐项检查表为[requirements](requirements.md)，不另造需求体系。本报告区分本地自动化、历史真实单样本、人工检查和未验证事项。阶段7官方模型请求必须且实际保持0，旧4D/6B/R1授权关闭不变。

**本地交付准备完成，仍有两项外部交付待办：GitHub/Gitee仓库链接，以及出题方工具口径确认。** 最终候选ddf1dc2已从已跟踪源码在同机独立目录使用提交内锁文件完成npm ci安装和全部本地验收；详见末节。真实质量、跨平台等限制不被本地测试覆盖。

## 交付材料与必要修补

- 源码与初始化：src、web、001/002/003，正式依赖根package/lock；没有新schema、ORM、讨论调度改写。
- 五组样例：src/sample-data.ts（教育/公共空间/工作制度/数字展览/食物减废，2/3/2/3/4专家+各一主持），全员虚构、职业/Title/立场不同。import-samples统一验证和系统赋值，整批事务；seed离线CLI锁库，重复幂等不覆盖、不自动确认/运行。复用DraftStore事务helper以支持整批原子导入，既有草稿语义不变。
- 普通入口：app-providers分开选择阵容/讨论，默认Fake；deepseek须有效后端环境配置与显式--allow-real-models。不读取私有文件自动启用；不静默回退。/api/config只报告两种名称，页面据此显示模式，失败显示未知。工厂接正式runner经本地HTTP替身验证，不请求官方。
- 启动清理：普通server补自有IPC shutdown，与已测试启动器配合释放.owner；Ctrl+C原入口保留。无新通用启动框架。
- 当前文档：README准确入口/命令、architecture当前ER/状态/时序、contracts清除已被替代SSE草案并补模式查询、requirements逐行证据、test-plan历史与当前区分、ui-spec模式说明。
- 开发过程：sources原始Prompt保持，追加P17与精选索引；workflow.md说明实际Codex/Skills、三真实问题与工程认识。Edge按A4/20mm/14px/1.65简易Markdown版式预览，连续高度约1.081页，非所有渲染器精确分页保证，见workflow-layout.json。

## 真实TDD及本轮问题

| 行为 | 实际RED | 修正与定向GREEN |
|---|---|---|
| 五组样例/重复/写失败 | 返回0组、记录数不符、未抛写失败，3失败 | 既有校验+系统赋值+统一事务，3通过；草稿/列表回归 |
| 普通Provider选择 | 显式真实仍Fake、未拒绝未授权配置，2失败 | 分别解析配置并检查CLI开关，3项通过；构造不发送 |
| 公开模式HTTP | /api/config为404 | 白名单两字段，HTTP回归通过 |
| 模式文案 | 给真实模式仍返回Fake标签 | 接后端公开配置，混合模式明确显示 |
| 后端自有退出 | shutdown消息后超时仍未退出 | IPC退出处理，退出0且owner释放 |
| Host安全边界 | 非本机Host GET返回200 | 拒绝非loopback Host，400且现有HTTP回归通过 |

原始RED/GREEN JSON在evidence/stage-7。首次交付冒烟脚本遗漏Playwright baseURL，查询抛Invalid URL；这是脚本准备错误，不记业务RED。清理同时揭示普通server缺IPC路径，用独立测试复现再修。只清理该次已退出测试PID的owner，保留测试库。之后独立新测试库冒烟通过。文档替换曾因CRLF匹配误删测试计划片段，提交前diff发现并从HEAD恢复后仅更新目标段，未改历史Prompt。

## 安全专项审查

使用来源（只读取，不安装、执行远程脚本或复制整份参考）：

- [OpenAI security-best-practices](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-best-practices)，固定49f948f；读取SKILL、React/Express/general-web前端参考、Apache-2.0 LICENSE.txt。临时文件在.cache/delivery-skills，来源清单见evidence/stage-7/skills.json。
- [Vercel web-design-guidelines](https://github.com/vercel-labs/agent-skills/blob/063bee94c3f4df8453406c830b0a7df0f2860278/skills/web-design-guidelines/SKILL.md)，固定063bee9；其[界面规则](https://github.com/vercel-labs/web-interface-guidelines/blob/e3d624baaf29dc1fc645aff3e38f03e564d2d6b1/command.md)固定e3d624b。所查agent-skills树中未取得该Skill独立许可证，标为未验证；不分发/安装Skill文件。

| 编号/等级 | 位置与证据 | 处理/限制 |
|---|---|---|
| S01 中等，已修复 | src/http/app.ts，原GET未限制Host，可构造外部域Host读取 | loopback Host白名单；HTTP先RED后GREEN。POST仍有JSON/Origin检查；只限本机可信使用，不宣称公网安全 |
| S02 交付安全接线，已修复 | src/server.ts、app-providers.ts | 默认Fake，显式选择加CLI开关；失败不回退；前端不得改地址/预算/故障模式 |
| S03 扫描无凭据形态命中 | scripts/delivery-security-scan.mjs，已跟踪文件及所有历史文本blob | 只输出位置/类型，无密钥原值；未读取私有配置正文；图片另人工抽查。模式扫描不能排除所有泄漏 |
| S04 已有边界检查 | domain/discussion/lineup、db复合关联、public-events、http/events | 引用同场验证、参数绑定、公开字段白名单；SSE64事件/256KiB/10秒背压、15秒心跳及连接清理测试 |
| S05 人工代码审阅 | web/src JSX、deepseek-transport | 不用dangerouslySetInnerHTML/eval，topic/正文按文本；推理字段不进入DTO，诊断白名单，不保存原响应。前端产物另扫后端配置符号 |
| S06 尚未覆盖 | 本地Vite/Express无公网部署/账户方案，列表无分页，CSP等生产加固未专项实施 | 不扩展部署功能；仅回环可信环境。依赖漏洞数据库、渗透测试和完整供应链审计未执行 |

测试与交付验证显式清除继承模型配置，子进程fetch守卫拒绝非本机；替身只在模型边界映射loopback。旧42个保护文件哈希保持（含R1九次原计数），不创建新真实授权。静态审查与白名单不是语义安全的完整证明。

## 界面与非空观点审查

既有e2e/runtime实际测试1/4/8位专家，390×844、1366×768、2560×1080，长话题/发言/观点、独立滚动、键盘焦点、空态、错误/断线/总结不可用。新样例可在首页查看，未重做样式。当前运行模式准确性通过HTTP、文案及正式入口浏览器核对。

低优先级待改进（不阻断当前作业主流程）：web/src/App.tsx缺跳至主内容链接，表单可进一步补name/autocomplete与错误后焦点定位；列表大量历史记录未做虚拟化。现有label、原生button、focus-visible、文本状态和各区滚动可用。没有声称全套WCAG或屏幕阅读器/移动真机认证。

已有非空测试足够覆盖本地结构：unit/discussion两专家共识与两立场分歧、非法/跨场引用；discussion-store真实证据表、旧来源拒绝；Fake E2E与HTTP替身页面中途非空观点、更新和证据跳转。无需重复造新夹具；这些不等同真实模型语义证据支持。

## 历史真实内容复查

原6B受阻0请求、P15本地启动修复、R1新独立授权成功保持分开。R1阵容预置、两次专家发言、一次合法空提炼、九次真实请求；没有验证真实非空共识/分歧质量。

读取R1公开原文：周衡第二条说“只在小范围试点中见到反馈效率提升”；陈思敏第三条也说“现有证据多来自小范围试点”，并建议以教师负担/反馈指标做对照。总结中的“当前证据多来自小范围试点”是对两条专家原话的概括，**不是主持人凭空新增该试点判断**；但专家原话没有提供研究来源，因此不能把该概括当作已验证外部事实。总结“均指出…公平与可评估效果”把两人侧重压缩归并，不能证明每人分别明确赞同每个分句。原输出保留，没有补外部来源、改输出或再调用改善。

## 图与外部待办

阶段7原验收时未找到本地渲染器，彼时只人工核图；阶段7补充收口已在隔离目录使用Mermaid11.12.0和现有Edge实际渲染全部7张有效图并逐图目视检查，详见下节。历史方案、Prompt和原始失败记录的图未改写；不宣称远程平台显示已验证。

第三部分远程GitHub/Gitee链接尚缺（git remote为空）；本轮不创建或推送。Codex与题面工具口径仍待出题方确认，不能签署或虚构许可。实际开发模型未核实；应用运行模型明确deepseek-flash。跨平台、移动真机、长期/多题质量与生产负载均未验证。

## 首次干净复现发现与修正

候选463101b在D:/Codex-delivery-check/stage7-d950261835/project从git archive导出；使用提交内锁文件执行npm ci安装127包成功，README类型/构建/初始化/两次样例导入与正式Fake浏览器冒烟均退出0。完整后端回归402通过/1失败：新增普通配置工厂测试用local-test-credential，而已有HTTP stub严格要求local-stub-credential，返回LOCAL_STUB_FAILURE。定位为测试夹具输入不一致，不是供应商或产品故障；改为引用已有adapterConfig.apiKey，单文件回归通过。保留first-clean-verification.json；不把该夹具错误计作业务RED，不修改生产鉴权或放宽parser。修正测试后另提交候选、重新导出新目录并完整复验，不只在临时目录修补。

## 最终干净目录复现（实际执行）

- 被测源码：`ddf1dc251156149914fcffde3d6d962fd72653f6`，在463101b交付修补后仅修正测试虚拟凭据。导出方式为git archive，不复制工作树或私有内容。
- 独立目录：`D:/Codex-delivery-check/stage7-final-11d59eb050/project`，来源元数据见[reproduction-final-source.json](../evidence/stage-7/reproduction-final-source.json)。这是同机新目录，不是跨平台认证；archive不含Git历史，原仓库历史仍保留。
- 初始确认node_modules、私有.env、.local、数据库、dist/web/dist、.cache均不存在。Node24.16.0/npm11.13.0；根目录唯一正式依赖安装127包，npm ci --ignore-scripts --no-audit --no-fund退出0，未运行生命周期脚本；没有改锁、force、全局升级或浏览器下载。
- 安装时间2026-09-16T15:52:47Z–15:52:50Z；正式冒烟15:53:38Z–15:53:45Z；完整回归15:54:01Z–15:58:13Z，均为UTC（本地UTC+8）。机器时钟实录，不倒填。
- README四项npm类型检查、三项构建、db:init及db:seed连续两次均退出0。两次导入相同五个ID，人工创建的样例在页面可见；自动化另验证不覆盖用户数据/确认状态及整批失败回滚。
- 执行记录命令包装器曾错误假设npm-cli在Program Files，实际报MODULE_NOT_FOUND、未执行该次类型检查；随后直接使用README的npm.cmd命令逐条运行。保留readme-command-wrapper-error.json；这是取证命令错误，非产品故障/业务RED，没有修改临时目录源码绕过问题。

| 最终实际命令/检查 | 结果 | 退出码 |
|---|---|---|
| npm ci --ignore-scripts --no-audit --no-fund | 127包，使用提交内锁文件执行npm ci成功 | 0 |
| node scripts/check-dependencies.mjs | 精确版本/锁一致；模块解析在新目录node_modules，无探针/Codex缓存依赖 | 0 |
| npm run typecheck、typecheck:web、typecheck:e2e、typecheck:startup | 4项通过 | 各0 |
| npm run build、build:web、build:startup | 后端、前端、启动脚本构建成功 | 各0 |
| npm run db:init；npm run db:seed ×2 | 新库001→002→003；5组导入及幂等 | 各0 |
| node scripts/delivery-smoke.mjs | 正式默认入口：可见5组→人工确认→开始→13公开发言和总结→刷新→停服只读重开一致；integrity_check=ok | 0 |
| node scripts/delivery-verify.mjs | 顺序执行下面所有正式套件，无整条自动重跑 | 0 |
| Vitest后端全套 | **403/403**，51文件；177单元+226集成（含SQLite/HTTP/SSE/适配器/启动），无跳过 | 0 |
| Vitest前端全套 | **91/91**，12文件，无跳过 | 0 |
| Playwright stage5c Fake核心E2E | **37/37**，0 skipped/unexpected/flaky，retries=0 | 0 |
| Playwright stage6a本地HTTP适配器E2E | **2/2**，成功与总结降级，0 skipped/unexpected/flaky | 0 |
| node scripts/stage6b-dry-run.mjs | 共享launch/readiness，本地短讨论/SSE中途/总结/刷新/关闭，独立testOnly夹具 | 0 |
| 安全扫描、前端构建符号扫描 | 历史887文本blob无凭据形态命中；前端3文件未混入指定后端配置符号；42受保护文件哈希无变化 | 0 |

完整argv、时间、退出码与套件输出：[clean/verification.json](../evidence/stage-7/clean/verification.json)；[逐文件数量](../evidence/stage-7/clean/test-counts.json)；[安装](../evidence/stage-7/clean/clean-install.json)；[README命令](../evidence/stage-7/clean/readme-commands.json)。原始Vitest/Playwright JSON保留在新目录evidence/stage-7/raw（忽略、不提交）；仓库只存筛选报告/截图，不存数据库、测试授权原始记录或trace。

正式默认Fake冒烟discussion为4e42b672-a468-4a0e-af6d-3a3adc0b2b28；[smoke](../evidence/stage-7/clean/smoke.json)记录停服重开与页面恢复。[样例截图](../evidence/stage-7/clean/samples.png)与[结束截图](../evidence/stage-7/clean/clean-completed.png)。Fake文字存在模板重复，只作为状态/持久化/上下文工程链路证据，不代表自然语言质量。

真实适配器经本地HTTP替身的[成功](../evidence/stage-7/clean/local-success.json)/[总结失败](../evidence/stage-7/clean/local-failure.json)分开记录；不是本轮真实DeepSeek结果。[共享启动结果](../evidence/stage-7/clean/startup-result.json)与[页面事件](../evidence/stage-7/clean/startup-ui-result.json)保留独立testOnly运行。官方请求为0：未加载私有配置；Fake或显式本机stub注入；所有验证子进程Fetch拒绝非本机，普通浏览器冒烟也拦截非本机地址；未执行任何live/prepare入口。该结论不是供应商账单查询结果。

## 最终界面复查、清理与交付边界

本轮实际目视检查新目录生成的样例/结束、desktop-running、narrow-studio、studio-8-experts、summary-unavailable、lineup-390-1-bottom、desktop-4-members截图，位于[clean/screenshots](../evidence/stage-7/clean/screenshots)。中文、模式标识、真实状态文本、长文区域和错误提示正常；窄屏长标题在限定区域滚动，未改变整体布局。自动化另覆盖独立滚动、焦点、1/4/8专家及非空观点更新/引用跳转。记录既有低优先级无障碍改进，不宣称所有浏览器或辅助设备通过。

本轮服务/独立浏览器已关闭，41861/41862、41871/41872、41881/41882、41901/41902、41912无监听。Playwright结束遗留两个本轮测试库.owner：核实绝对路径位于本次独立目录.tmp下且记录PID19488/6456已退出后仅移除这两个锁，库和其他目录保留；这是Windows测试退出清理限制，不自动删除未知锁。[清理证据](../evidence/stage-7/cleanup.json)。共享启动器与正式默认入口均自行正常释放owner。旧4D/6B/R1库、授权和计数哈希不变，保持closed；私有配置仍忽略且未跟踪。没有清空旧预算，没有新增真实授权。

Git实际提交：463101b（交付小修/样例/文档）、ddf1dc2（测试夹具修正）；最终证据以随本报告的文档提交归档。最终回归之后只追加文档与筛选证据，源码/样例/配置未改，因此不重复机械全测。使用既有项目身份schen，未改写历史、未创建远程或推送。

**待用户/出题方处理：**（1）第三部分GitHub/Gitee仓库链接尚缺，需另行授权创建与推送；（2）确认实际Codex开发是否符合题面工具口径，不补造Claude Code使用记录。**未验证：**真实非空观点语义、长期多话题质量、性能/负载、跨平台/移动真机、GitHub/Gitee图表显示及完整无障碍/安全认证。R1真实短样本与4D真实阵容仅沿用历史证据，本轮不追加调用。到此停止，不自动发布或执行新的真实讨论。

## 阶段7补充收口：锁文件、版本与图表（2026-09-17）

### 安装来源与版本关系

阶段7实际使用 **npm ci --ignore-scripts --no-audit --no-fund**，复用ddf1dc2提交中的清单和锁文件；没有重新生成锁文件。“重新锁定安装”是此前聊天中的不准确措辞，现明确为“依据提交内既有锁文件执行npm ci”。原始安装/测试记录保持原样，不重写日志。

核对Git已跟踪全部package.json/package-lock.json：正式应用只有根目录一组，web没有独立清单或锁，根脚本直接编译/测试web；tools/env-probe另一组属于历史探针，不参与正式复现。对照原git archive压缩包与安装后仍保留的新目录：package-lock.json的SHA256同为aa882ffbfdc83fc4a2698b4d2828a1b5c4c3e7c1216b16d353b315437c84d138，package.json同为e0455f9562b27e4de4c74df3a59c0c26965af2cf99ee439f13c21370f4820e9c。Git blob为LF，导出为CRLF（本库core.autocrlf=true），仅换行不同；规范化内容和当前Git blob完全一致，不能把字节换行差异误判为npm改锁。[逐文件哈希](../evidence/stage-7/closure/archive-lock-hashes.json)、[来源与版本核对](../evidence/stage-7/closure/lock-and-version.json)保留完整依据。

实际被测应用提交仍为ddf1dc251156149914fcffde3d6d962fd72653f6；本轮起点HEAD为10b7d28。ddf1dc2之后只有10b7d28一个提交，29个路径均为2份文档及27份证据。源码、依赖、配置、样例、运行/构建/初始化/测试脚本和README均无差异；README npm命令与clean/readme-commands及verification命令对照一致。此前403后端/91前端/37 Fake E2E/2 HTTP替身E2E为历史已执行结果，本轮没有再跑，亦不写成本轮新成绩。

本轮仅更新当前文档状态、一处过期锚点、真实Prompt索引/过程记录；新增两个交付验证脚本及精简渲染证据，不进入产品运行或构建配置。本轮文档/证据提交由Git历史中包含本节的提交标识，不为了写入自身哈希另造提交；最终答复单独给出该哈希。应用代码仍对应ddf1dc2。

### 图表逐项验收

| 文件及源码位置 | 标题 | 类型 | 结果 |
|---|---|---|---|
| architecture.md:24 | 当前数据库关系（003） | ER | 渲染/目视通过 |
| architecture.md:44 | 生命周期 | 状态机 | 渲染/目视通过 |
| architecture.md:63 | 一次专家发言与中途提炼 | 时序 | 渲染/目视通过 |
| discussion-runtime-design.md:57 | 生命周期与唯一runner | 状态机（中文） | 渲染/目视通过 |
| discussion-runtime-design.md:145 | 调用路径、并发与有限总预算 | 时序（中文） | 渲染/目视通过 |
| discussion-runtime-design.md:219 | 事务与公开状态 | ER | 渲染/目视通过 |
| lineup-design.md:65 | 生命周期、重复与恢复 | 状态机（中文） | 渲染/目视通过 |

共7图：2 ER、3状态、2时序。每张均实际打开本地PNG检查中文字形、标签完整性、箭头/关系和布局；程序检查也未发现文字超出SVG边界。实体与schema-v2/v3关联、生命周期与当前契约一致。时序图表达正常非末轮路径，末轮按同文正文跳过提炼并收尾；不是另一套运行规则。无需修改Mermaid源代码，Markdown源码全部保留。

渲染器为官方npm mermaid@11.12.0（MIT，仓库mermaid-js/mermaid），不使用在线编辑器。隔离目录D:/Codex-delivery-check/mermaid-11.12.0-bdde270397；先审阅npm包脚本、生成隔离锁并检查hasInstallScript（无），再npm ci --ignore-scripts --no-audit --no-fund安装125包；传递包prepare脚本记录且未执行。该目录的锁不属于应用锁。复用项目Playwright和现有Edge153.0.4234.32，不下载浏览器、不安装全局工具。API用法依据[官方使用文档](https://mermaid.js.org/config/usage.html)，实际版本与依赖证据见[renderer-install](../evidence/stage-7/closure/renderer-install.json)。

实际命令（根目录，渲染依赖目录须先按上述方式准备）：

`node --check scripts/render-delivery-diagrams.mjs`

`node scripts/render-delivery-diagrams.mjs D:/Codex-delivery-check/mermaid-11.12.0-bdde270397`

均退出0。[渲染清单](../evidence/stage-7/closure/render-results.json)记录源文件/行/标题/类型/源哈希和尺寸，7份SVG各对应一个有效图，保存在[diagrams](../evidence/stage-7/closure/diagrams)；PNG仅保留于隔离目录供人工检查，不重复提交。全部内容只由回环服务送入独立本地浏览器；非本机请求被拒绝，未上传项目图表。本地通过不代表GitHub/Gitee远程渲染通过。

### 链接、复验与边界

检查README及9份当前交付文档的内联相对链接，依Git跟踪路径（含待提交清单）、文件存在及Markdown标题锚点核对。README到API/SSE、架构/数据、样例源码及就地导入说明、Prompt精选索引、工作流、总报告均有效。发现运行规格一处旧“阶段5A契约草案”锚点，目标文件存在但标题已更名；只修正该链接和标签，未动历史Prompt。[修前结果](../evidence/stage-7/closure/links-before.json)保留65条中1条失效；[最终结果](../evidence/stage-7/closure/links.json)含新增证据链接共72条，失败0。R26更新为7图本地渲染通过、远程未验证。

`node --check scripts/check-delivery-links.mjs`、`node scripts/check-delivery-links.mjs`及git diff --check均实际执行；未重新安装应用依赖、未启动应用服务、未执行迁移或全量产品测试。两个小脚本仅用于交付材料，不在package脚本/运行入口中引用。

独立Edge及临时回环渲染服务已在finally关闭（本次端口44269）；隔离依赖和预览保留可复查，没有删除未知进程或用户文件。没有访问私有配置正文、数据库或授权记录，没有模型请求。原始验收证据及历史Prompt前缀保持，应用锁不变。两项外部待办仍是GitHub/Gitee实际链接及评阅访问、出题方对Codex工具口径的确认；真实非空观点语义、长期质量、跨平台/移动真机、全面安全/无障碍仍未验证。停止，不发布、不继续扩功能。

## 阶段8发布准备与认证阻塞（2026-09-17）

用户P19明确授权唯一现有仓库[GitHub schen0690-boop/-mvp](https://github.com/schen0690-boop/-mvp)的受控合并、正常main推送与远程核验；不授权新建/改名/改变可见性/强推。起点本地main干净，HEAD为0bfafeaa846addb114d282948a301acd5c2baf05，文件树47fba9d2ec4b33068e10ea2e0b6c5df358a871d4，应用仍对应ddf1dc2。不存在origin时添加指定HTTPS地址，fetch/push展开后均唯一且相同，不含凭据。

实际远程main为21ae9431093775c7ed8873fb73a67c8f728e36f8，仅一个README文件、内容为# -mvp，无共同祖先。按授权执行allow-unrelated-histories/no-commit/no-ff，仅README发生add/add冲突；精确保留原本地完整版README。git write-tree与原候选完全相同后创建合并921f337dc22c4cbb1cf11395753cfb23ea459d41，双亲为原本地候选和远程初始化提交，54个可达提交全部保留，没有改写历史。

使用现有Git Credential Manager尝试正常推送，退出128：没有可用认证，交互被禁，尚未上传代码。随后ls-remote核对远程仍为初始化21ae943，不能当作推送成功。已请用户本人运行git credential-manager github login --browser --username schen0690-boop完成官方登录；未读取/索取密码或Token，也未用其他账户凭据。登录后仍需正常推送、匿名网页与7图检查、非浅远程克隆，当前这些交付核验均未完成。

本次匿名GitHub API已返回200、private=false、visibility=public、default_branch=main，但只证明占位仓库可读，不证明项目已发布。没有改变仓库可见性，没有新增Actions/Secrets/Pages/Release；本地只有.sample hooks且core.hooksPath未配置，远程初始化树无Actions。

发布安全补查覆盖932可达文本对象（含SVG及example），凭据形态命中0；历史路径无私有.env、数据库、.local或node_modules；20MiB以上blob为0。截图沿用相同blob的阶段7审查，新Mermaid SVG由阶段7收口目视；模式扫描不等于全面安全保证。旧42个受保护文件哈希不变，旧授权closed保持。证据在[stage-8](../evidence/stage-8)：preflight、merge、security-scan、publish-scan、history-paths、anonymous-before、push-attempt。原验收记录未覆盖，官方模型请求0，未启动应用/浏览器/真实服务，未重跑产品测试。

当前状态：**发布受阻于认证，不能标记“远程仓库及评阅访问完成”**。远程完整克隆、最终HEAD/树/历史、关键页面及Mermaid GitHub实际渲染待认证后继续。本轮只新增发布记录和原Prompt，源码/依赖/配置/样例未变；另一个外部待办仍是出题方对Codex工具口径的确认。没有任何新信息允许改写为Claude Code使用记录。
