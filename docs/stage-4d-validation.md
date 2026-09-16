# 阶段4D验证记录

## 授权及实施顺序

A：配置/提示词→原生fetch适配器→重试/取消局部修正→持久化一次性验收保护→本地HTTP stub/正式业务集成→回归/构建。每项先行为RED，再GREEN，按实际完成提交。
B：必须待用户在.env.backend.local配置并回复“已配置”。指定“AI 如何改善教育？”、4专家另加主持人；唯一discussion/generation，累计最多2次真实请求，首次成功即关闭；无Hello/余额/模型列表探测。4D-A结束时真实请求0、授权未激活；4D-B最终结果见末节（1次成功、授权已关闭）。

## 官方依据（2026-09-16读取）

- https://api-docs.deepseek.com/api/create-chat-completion/ ：模型deepseek-flash、顶层thinking、stream=false、json_object及finish_reason。
- https://api-docs.deepseek.com/guides/thinking_mode/ ：显式disabled，不把SDK extra_body作为HTTP键。
- https://api-docs.deepseek.com/guides/json_mode/ ：同时要求提示词JSON与结构示例；不把格式模式当作业务校验。
- https://api-docs.deepseek.com/quick_start/error_codes/ ：400/401/402/422配置/账号问题；429/500/503暂时失败。
- https://api-docs.deepseek.com/ ：官方端点与Chat Completions入口。

4096为用户本轮上限，不是官方最大值。不猜价格、账户状态或实际支持结果。应用提示词独立于P8开发Prompt归档。

## 当前边界

使用已有RosterGenerator和parseRoster→enrichRoster→SQLite事务。仅必要地扩展内部Provider错误/取消和generation上下文，不增加公开错误协议、生命周期或迁移。测试传输显式注入，普通测试不加载私有配置。不得查看用户填写后的配置正文。

## A：已执行本地验证（2026-09-16）

### 真实RED→GREEN

- config-red：9项中8项因骨架固定Fake失败；adapter-green中配置9项全通过。
- adapter-red：26项因DeepSeek骨架未实现失败；adapter-green共35项通过。覆盖参数、鉴权占位、外层/空正文/finish/tool/reasoning隔离、错误分类；不是Fake替代适配器。
- pipeline-red：13项中4项失败，证实过滤、工具调用、aborted被重复调用及stale失败仍发第二次；修正原服务的内部错误判断和重试前代次检查后，全后端238项通过。
- authorization-red：持久化预约/关闭/第二场约束6项失败；authorization-green含5项真实本地HTTP stub共11项通过。HTTP stub测试直接运行真实适配器和native fetch，固定官方URL在测试传输边界映射到127.0.0.1临时端口；只使用dummy key。
- timeout-guard-red：服务层30秒计时器发出的Abort原来被适配器视为主动取消，导致预算过早关闭。用真实服务+适配器+持久化保护复现1项失败；Abort原因显式携带timeout/cancelled后全后端254项通过。
- provider-label-red：共享界面恒称Fake会误标未来真实阵容，1项失败；改为虚拟嘉宾中性说明后69项前端通过。没有改界面布局或公开DTO。

JSON guide直接抓取曾超时，随后通过官方同页搜索索引取得内容；请求协议也由官方Chat Completions页交叉核对。未查询价格/余额/模型列表或调用模型。

### 最终命令和结果

所有命令由record-command.ps1调用项目内同一脚本入口，原始stdout/stderr/退出码/源码哈希保留于evidence/stage-4d。

| 根目录命令 | 结果 | 退出码 | 记录 |
|---|---|---|---|
| npm run typecheck | 通过 | 0 | verified-backend-types.json |
| npm run typecheck:web | 通过 | 0 | verified-frontend-types.json |
| npm run typecheck:e2e | 通过 | 0 | verified-e2e-types.json |
| npm run build | 后端编译通过 | 0 | verified-backend-build.json |
| npm run build:web | 23模块构建通过 | 0 | verified-frontend-build.json |
| npm test | 254项：原190＋新增64；141单元＋113集成 | 0 | verified-backend-tests.json |
| npm run test:web | 69项：原68＋中性文案1 | 0 | verified-frontend-tests.json |
| npm run test:e2e | 26项，全部仍为Fake/网络故障注入的本地回归 | 0 | verified-e2e.json |
| npm run config:check | 密钥未配置；本地检查，无网络 | 1（预期） | config-presence.json |
| node scripts/check-stage4d.mjs | 历史/范围/源码哈希/忽略/泄漏模式/skip与only检查通过 | 0 | verified-scope-check.json |

新增后端64＝配置9＋适配器26＋授权6＋配置文件1（42单元）＋真实SQLite管线13＋HTTP stub5＋guard组合4（22集成）。HTTP29与迁移12仍包含在原190，不能重复计数。所有测试无skip/only，E2E无重试通过。已知warning为NO_COLOR/FORCE_COLOR同时设置；Vitest只给worker复用性能建议，未因此取消隔离。没有安装/升级软件或依赖，锁文件保持原样。

### 安全和本地实现范围

只从显式后台入口加载.env.backend.local；普通npm start仍硬性Fake，不受私有配置或机器上模型环境变量影响。真实入口必须deepseek且配置严格匹配本轮设定；缺配置拒绝启动，不静默fallback。config:check只给已配置/未配置，不读取输出文件正文。

请求禁重定向，TLS保持默认校验。适配器无重试；服务层每代最多2次、单次完整响应30秒、总60秒。流式读取仅为读取非流式HTTP正文，不启用模型stream；空行照常处理，响应体最多128KiB后拒绝，避免无限缓冲。已有阵容正文16KiB限制保持。400/401/402/422等不重试；429/500/503有限重试；length/无效结构走同一输出修复预算；过滤/aborted停止。取消本地连接不保证远端不计费。

一次性保护不新增业务表：固定.local目录绑定discussion/generation，request-1/2文件先独占创建并fsync再发请求；结果不明也保留预约。白名单结果仅耗时/HTTP/finish/id/model/usage/outcome；无usage则不生成usage字段。成功复用既有parseRoster检查后关闭（业务层随后仍按原流程校验和事务提交）；永久错误、第二次失败、停止也关闭。重跑不清零，closed和残留server.lock不得自动删除。未发送阶段不创建真实授权目录。

## B交接时的历史状态（4D-A结束时；最新结果见下节）

| 项目 | 当前事实 |
|---|---|
| 配置检查 | 密钥未配置；未查看配置正文 |
| 实际官方模型请求数 | 0 |
| 真实模型响应名称/usage/耗时 | 未取得，不能写为0 tokens或估算费用 |
| discussion/generation、公开阵容/截图 | 未生成；本轮截图目录只有Fake回归 |
| 剩余真实额度授权 | 最多2次尚未激活，等待用户“已配置”；没有真实服务/任务留在运行 |
| 验收范围 | B执行后也仅一个指定话题4专家样本，不代表1–8人/长期可靠性或5组样例完成 |

填写路径/示例/忽略规则/后端加载及检查命令见README的阶段4D交接。用户回复后不再重新询问供应商/模型选择，按已授权流程运行独立41851/41852与.local验收库；首次失败仅当前generation内剩余一次，终结后不点击重试。成功后只GET/确认/刷新，停止自有进程并保留关闭记录。本轮目前在交接处停止。

### 发送编号与指标归属补强

收尾发现使用authorization.count记录异步完成指标可能错配请求：第一次超时返回诊断时，第二次预约已存在。新增结果文件断言先失败（发送编号未随调用传递，未生成应有的result-1）；按预约时的acceptanceAttempt把指标固定到具体请求，4项组合测试通过。指标与实际请求一一对应，不用当前总次数猜测。原final-*证据保留为修复前运行，修复后最终使用verified-*全套记录。

## 4D-B实际执行：单样本真实阵容联调通过

执行日期2026-09-16，Asia/Shanghai。用户本轮先明确确认“此前密钥已撤销，当前本地配置使用未公开的新密钥”；此后才启动真实环境。未查看、输出、比对或更改私有配置，未测试旧密钥。此次沿用原同一份累计两次授权，不增加额度。

### 入口与前置检查

- 产品代码版本：`0a39fada64ee118e26278d557e03097c7329359b`。本轮没有修改src/web/tests、依赖或适配器。
- 启动前Git干净，config:check退出0且只报告密钥已配置；私有配置忽略且未跟踪；`.local/stage-4d-live`不存在，41851/41852空闲。
- 后端实际命令`npm run live:stage4d`，127.0.0.1:41852；前端`WEB_API_TARGET=http://127.0.0.1:41852`与`npm run dev:web -- --port 41851`，127.0.0.1:41851。只读GET空列表验证代理链路。监听进程分别15520/10380。
- 独立验收库`.local/stage-4d-live/discussions.sqlite`由现有入口首次建立，001/002迁移均登记；未接触原业务库。原预算目录由现有机制一次初始化，绑定与预约均保留。
- 固定官方端点`https://api.deepseek.com/chat/completions`，deepseek-flash、thinking.disabled、stream=false、json_object、max_tokens=4096；来源为已核对的生产配置校验及实际适配器，不打开私有文件。
- 独立Headless Edge非持久化上下文；没有下载/安装，未访问日常浏览器资料。一次性脚本不通过会重跑的Playwright测试runner执行，不加重试。

### 唯一样本与真实调用

话题“AI 如何改善教育？”，4专家另加1主持人。

| 字段 | 实际值 |
|---|---|
| discussionId | 5e88ffe2-05ae-446a-97b7-8e9a72f5d9c8 |
| generationId | 9a00202f-8dd4-4ab3-9272-fa8152003d02 |
| generationVersion / lineupRevision / confirmedLineupRevision | 1 / 1 / 1 |
| 最终状态 / version / lastEventId | lineup_confirmed / 4 / 4 |
| 页面主流程时间（UTC） | 2026-09-16T09:30:43.773Z 至 09:31:46.790Z |
| 第1次预约时间（UTC） | 2026-09-16T09:30:46.650Z |
| 第1次结果 | HTTP 200，finish_reason=stop，1830ms，正文通过原结构/业务校验 |
| 请求 / 响应模型 | deepseek-flash / deepseek-flash |
| 供应商返回请求标识 | bbcd4786-d135-4f42-9149-f2809a032bf6 |
| prompt_tokens / completion_tokens / total_tokens | 347 / 248 / 595 |
| prompt_cache_hit_tokens / prompt_cache_miss_tokens | 0 / 347 |
| 保守预算预约 / 有证据实际请求 / 成功响应 | 1 / 1 / 1 |
| 第2次请求 | 未发送；不存在request-2文件 |
| 关闭原因与时间 | valid_result，2026-09-16T09:30:48.485Z；未用1次权限已关闭 |

上述usage是实际返回字段，不代表已核对账单，不估造费用。没有结果未知的请求、模型探针、模型列表、余额查询或第三次验证请求。

### 公开阵容人工审查

全部姓名明确标注“（虚构）”。以下仅为经过现有校验的公开内容摘要，完整白名单见`evidence/stage-4d-b/terminal.json`。

| 角色 | 姓名 | 职业 / 头衔 | 关注点 |
|---|---|---|---|
| 主持人 | 林知言 | 公共议题沟通 / 圆桌讨论主持人 | 中立梳理问题和不同观点 |
| 专家 | 周明川 | 教育技术研究 / 智能学习系统研究员 | 个性化学习、即时反馈及效果验证 |
| 专家 | 许静仪 | 教育政策与公平 / 教育公平政策研究者 | 数字鸿沟、资源分配及校际区域不平等 |
| 专家 | 陈立平 | 教师教育与课堂实践 / 师范院校教学法教授 | 教师辅助、师生互动和教学自主性 |
| 专家 | 赵文澜 | 教育数据伦理 / 学习分析与隐私伦理专家 | 学生数据保护、透明与问责 |

判断：专业背景与话题相关，四种关注点有合理差异；该判断只适用于此阵容，不代表讨论质量或事实准确性已经验证。未为优化姓名/措辞再次生成。ID、配色与顺序由已有enrichRoster生成，脚本核对5个唯一ID、系统配色与0–4顺序，模型仅提供候选公开字段。

### 保存、页面与恢复验证

| 步骤 | 实际结果 |
|---|---|
| 页面创建 | POST /api/discussions 一次，201，草稿独立保存 |
| 页面生成 | POST /api/discussions/{id}/lineup 一次，202，绑定上述唯一代次 |
| 校验与保存 | 原parseRoster与事务链路形成awaiting_confirmation，5成员完整，无手工入库 |
| 展示 | 页面逐成员姓名/职业/头衔/立场与GET相符；未显示隐藏推理、内部错误或原始JSON |
| 确认 | 人工阅读公开阵容后，页面确认一次，HTTP 200，进入lineup_confirmed |
| 刷新 | 页面刷新后的完整snapshot与确认后相等；成员、代次和revision保持不变 |
| 停服后读取 | 只读重新打开同一SQLite，通过实际DraftService读取已确认结果；4个公开事件、version/lastEventId均4，外键检查空、integrity_check=ok |

页面只有创建、生成、确认三个POST；后续补充完整成员截图仅GET同一讨论，没有第二次生成。初次待确认/已确认/刷新截图为1600×1400，完整成员补图为1600×2200。

- [待确认截图](../evidence/stage-4d-b/awaiting-confirmation.png)
- [已确认截图](../evidence/stage-4d-b/confirmed.png)
- [刷新后已确认截图](../evidence/stage-4d-b/refreshed-confirmed.png)
- [同一阵容完整成员截图](../evidence/stage-4d-b/confirmed-all-members.png)
- [最终安全指标与数据库核验](../evidence/stage-4d-b/verified-live.json)
- [单次页面流程记录](../evidence/stage-4d-b/ui-result.json)

### 本轮检查、运行问题与收尾

| 实际命令/动作 | 结果 | 退出码 |
|---|---|---|
| npm run config:check | 密钥已配置，无网络；前置和收尾各检查一次 | 0 |
| node node_modules/typescript/bin/tsc -p tsconfig.build.json | 后端编译（等价npm run build） | 0 |
| node --check scripts/stage4d-live-ui.mjs | 单次验收脚本语法 | 0 |
| node scripts/stage4d-live-ui.mjs | 唯一UI真实样本通过，浏览器关闭 | 0 |
| 只读补充截图命令 | 同一已确认阵容，独立上下文关闭 | 0 |
| node scripts/check-stage4d-live.mjs | 只读重开库、计数、终态、源码/忽略/历史前缀检查 | 0 |
| 终端Ctrl+C关闭两个自有服务 | 监听均退出，server.lock由原关闭逻辑移除；授权保持关闭 | 终端包装退出1（主动中断，非业务失败） |

人工审阅标记第一次写入误用PowerShell Set-Content不支持的-NoClobber，命令退出1；改为FileMode.CreateNew后退出0。期间同一浏览器等待审阅，无重发创建/生成、无代码修复或预算变更。没有把这项操作错误冒称产品TDD RED。

既有254后端、69前端、26 Fake E2E和三套类型检查/前端构建本轮没有重跑，沿用4D-A记录。未改生产代码，新增仅验收脚本、脱敏证据、Prompt与文档。

收尾没有清空预算/绑定/数据库，私有配置保持用户原样；没有未决模型调用。两个验收端口无监听，所有本轮浏览器上下文关闭。源码版本未变，Git仅提交本轮脱敏产物，不推送。

结论：**单样本真实阵容联调通过**。不代表其他话题、全部1–8人数、长期可靠性、生产负载或完整产品E2E通过；不是五组交付样例已完成。讨论调度、SSE、共识、演播厅未实现。本轮调用权限已经关闭，不得重启或清理记录来再次生成。
