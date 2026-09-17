# 需求与追踪矩阵

状态：阶段7交付核对。下表为唯一当前检查表；后文阶段补充保留历史语境。证据等级分开，最终命令与数量见delivery-validation.md。

## 来源与边界

- **A**：用户提供截图前三部分的明确要求。来源为 `C:\Users\Administrator\Desktop\微信图片_20260915165216_49627_25.jpg`，本轮已目视读取。下面是结构化转述，非逐字题面转录；图片可取得，未提供可检索的官方文字版。
- **B**：阶段 0、阶段 1A 及本轮路径补充的用户原文，见 [真实 Prompt](sources/development-prompts.md)。用户已确定技术路线和阶段权限。
- **C**：本项目为落实 MVP 提出的设计建议，待用户确认后才成为实现基线。
- **D**：事实、需求解释或执行前置仍未确认；不能据此宣称符合题面。
- [阶段 0 原报告](sources/stage-0-audit.md)是环境与建议的历史证据，不替代题面或本轮指令。其旧项目路径和本轮范围外内容不构成本轮需求。
- 只分析背景与业务需求、重要规则、交付物要求；题面第四、五部分不进入需求或验收。
- 简称：ARCH＝[架构](architecture.md)，API＝[契约](contracts.md)，UI＝[界面](ui-spec.md)，TEST＝[测试计划](test-plan.md)，LOG＝[开发记录](development-log.md)。测试计划已逐阶段映射实际测试；本地替身与真实单样本的证据不能互换。

## 产品与工程要求

| 编号 | 来源 | 要求描述 | 设计去处 | 计划验收方式 | 当前状态 | 待确认事项 |
|---|---|---|---|---|---|---|
| R01 | A §1.1–1.3 | 面向知识工作者、产品决策者、教育/内容创作者，支持多视角深度审视及持续讨论；回应视角单一、上下文割裂、过程不可见和多议题管理困难 | src/domain/discussion-service.ts；web/src/Studio.tsx | 5C/6A/R1；阶段7全层复验见总报告 | 本地自动化＋R1人工单样本；深度质量未验证 | “沉浸感/深度”采用人工评审，不虚构自动质量分数 |
| R02 | A §1.4 | 首页显示正在进行的讨论，可创建或进入观察已有讨论 | web/src/App.tsx、controller.ts | e2e/drafts、runtime：列表、观察与两场并行 | 本地自动化已验证 | C：同时提供已结束记录入口，非额外实时任务 |
| R03 | A §1.1、1.4 | 输入话题、专家人数；题面默认 4 人 | src/domain/input.ts；web/src/App.tsx | input.test、drafts.test、e2e/drafts | 本地自动化已验证 | D01已获B类确认：4位专家另加主持人；原理解依据为“指定参与专家人数”与“主持人+专家阵容” |
| R04 | A §1.4 | 动态生成主持人和专家阵容，展示姓名、职业/Title、立场、专属颜色，用户确认后开始 | lineup-service.ts、deepseek.ts、LineupPanel.tsx | stage-4d-validation；lineup/deepseek/E2E | 本地自动化；4D真实单样本已验证 | 姓名为虚构角色，C：页面标为 AI 虚构专家 |
| R05 | A §1.4 | 主持人负责开场、追问、串联、收尾总结 | discussion-service.ts；discussion-prompt.ts | discussion-runner/controls；R1不覆盖全部主持介入 | 本地自动化；R1开场/总结真实单样本 | 主持人介入频率是 C，非固定脚本 |
| R06 | A §1.4；B 阶段0 | 专家根据当前 transcript 自主决定回应意愿；可举手/抢答/补充/反驳；不机械轮流、不预生成整场剧本 | discussion.ts rankCandidates；discussion-service.ts | unit/discussion、runner、adapter-runner；R1公开记录 | 本地自动化；R1人工检查回应相关 | 不承诺模型每次都产生高质量观点 |
| R07 | A §1.4 | 每次发言 1–2 句 | domain/discussion.ts parseUtterance | unit/discussion、adapter-http | 本地自动化；R1人工短句检查 | C：输出句子数组限制 1–2；自然语言句界另审查 |
| R08 | A §1.4 | 每位专家独立小窗，实时显示待机/准备发言/发言中及当前关注点或公开思考摘要 | role_public_states；Studio.tsx | e2e/runtime；stage-7截图 | 本地自动化＋界面人工检查 | C：使用独立 publicFocus 字段，不从隐藏推理提炼 |
| R09 | A §1.4；B | 不展示真实隐藏 chain-of-thought | deepseek-transport、snapshot、Studio | adapter-http、HTTP/SSE、delivery安全扫描 | 本地自动化＋限定安全审查；无全面保证 | 公开内容语义也需人工检查，不能只过滤字段名 |
| R10 | A §1.4 | 共识与分歧在讨论中持续提取并同步，不等结束才生成 | sqlite-discussion.synthesize；Studio | discussion-store、e2e/runtime、e2e-local | 非空本地自动化；R1真实空提炼 | C：每次专家发言后触发一次更新，可合并待执行版本 |
| R11 | A §1.4 | Transcript 展示发言人姓名、职业/Title、角色颜色；不显示举手等内部事件 | Studio.tsx、public-event.ts | events/stream测试及e2e/runtime | 本地自动化＋人工检查 | 无 |
| R12 | A §1.4 | 结束时由主持人给自然语言总结，不将 JSON 原文直接展示到页面 | discussion-service总结分支；Studio | adapter-runner、e2e-local、R1 | 本地自动化；R1真实有效总结 | B：总结暂为1–2句；长总结是否符合题意仍待出题方确认，见D02 |
| R13 | A §1.4、§2 | 本地运行、前后端分离，数据库必须 SQLite | runtime.ts、db/migrations.ts、server、web | migrations/runtime-migration、delivery复现 | 本地自动化；同机干净目录复现见总报告 | SQLite 驱动见 D03；本地运行不等于离线推理 |
| R14 | A §1.4；B | 应用大模型 API Key 只由后端环境变量读取，不暴露浏览器 | app-providers.ts、providers/config.ts | app-providers测试、Git历史/前端构建扫描 | 本地自动化＋限定安全审查 | P8确认DeepSeek设置；不查看或归档密钥原值 |
| R15 | A §1.4 | 支持多讨论并行；状态、事件流、transcript、共识/分歧相互隔离 | discussion-service、sqlite-discussion、public-events | discussion-controls、SSE、e2e/runtime | 本地自动化已验证；非真实并发性能保证 | 并发默认值已获B类确认，见D02，尚无性能验证 |
| R16 | A §1.4；B | 实时通信；用户确定 HTTP 操作 + SSE 公开推送 | http/events.ts；discussion-stream.ts | SSE集成、Fake E2E、R1事件索引 | 本地自动化；R1真实过程SSE已验证 | 补发保留范围为 C |
| R17 | A §1.4 | 中文响应式；各区域在容器内独立滚动，不依赖整个页面滚动；超宽/普通桌面合理分区 | styles.css、studio.css | e2e/layout/runtime：390/1366/2560；非真机 | 本地自动化＋桌面视口人工检查 | 窄屏切换区域的具体形式为 C |
| R18 | A §1.4、§2 | 从零原创、分阶段工程拆解；禁止单 Prompt 一键生成完整项目 | Git历史；sources/development-prompts.md | git log；各阶段RED→GREEN | 人工检查：分阶段实际提交与Prompt | 使用依赖/参考 Skill 不等于把既有完整应用作为原创 |
| R19 | A §2；B | 主体开发使用 Vibe Coding 工具；实际采用 Codex，不虚构其他工具使用；Skills/MCP 为题面鼓励项 | development-log.md、workflow.md | D05；不声称用过Claude Code | 实际Codex；题面工具口径待外部确认 | D05：题面指定工具表述冲突未获出题方确认 |
| R20 | A §1.4、§3.2；B | 核心逻辑严格 TDD；完整系统 E2E；Prompt 体现阶段切换与纠偏 | tests/、web/tests/、e2e/、e2e-local/ | 阶段2/4B/5B/5C/6A及7报告 | 真实TDD证据与本地核心系统E2E | 环境风险 D06 不阻塞文档 |
| R21 | B 阶段1A | React/Vite/TS、Node/Express/TS、npm；Vitest；项目内 @playwright/test，后续锁文件 | package.json、package-lock.json | scripts/check-dependencies.mjs | 本地锁定依赖验证；干净复现见总报告 | 具体版本 1B 核实，不依赖 Codex 私有缓存 |
| R22 | B 阶段1A | 共用类型之外，必须有用户输入和模型输出的运行时校验 | domain/input、lineup、discussion；web/api | 单元/SQLite/HTTP/消费者/适配器测试 | 本地自动化已验证 | 校验库具体选择 1B 核实 |
| R23 | B 路径补充 | 项目文件置于 D:\实测文件夹；阶段1A只文档且已初始化Git；阶段1B仅环境探针，阶段2授权草稿模块；不重新初始化Git，不猜身份提交 | AGENTS.md、Git | delivery-validation | 人工检查实际根目录；新目录仅用于复现 | 无 |

## 第三部分完整交付追踪

| 编号 | 来源 | 要求描述 | 设计去处 | 计划验收方式 | 当前状态 | 待确认事项 |
|---|---|---|---|---|---|---|
| R24 | A §3.1 | 完整项目源码最终提供 GitHub/Gitee 链接，包含代码和数据库初始化脚本 | src/、web/、init-db.ts、db/migrations.ts、Git | 阶段8正常推送、匿名访问及非浅克隆；见delivery-validation | [GitHub源码及完整历史](https://github.com/schen0690-boop/-mvp)已发布并核验 | 无远程访问待办；工具口径另见D05 |
| R25 | A §3.1 | 至少 5 条高质量样例数据，含预设讨论话题与对应嘉宾阵容 | src/sample-data.ts、import-samples.ts、seed.ts | samples.test、db:seed两次、delivery-smoke | 五组本地人工样例；自动化与浏览器复验 | C：按至少 5 组话题+各自主持人/专家阵容解释完整度；5 位嘉宾不是 5 组样例 |
| R26 | A §3.1 | 开发文档体现 PRD、ER 图等，使用 Markdown、Mermaid；包含 API 文档 | requirements、architecture、contracts、ui-spec | 阶段7补充：Mermaid11.12.0/Edge七图渲染及逐图目视 | 当前7图本地及GitHub实际渲染并目视通过，中文/关系/标签可读；Gitee未验证 | 后续必须按实际实现更新 |
| R27 | A §3.1 | 交付测试代码 | tests/、web/tests/、e2e/、e2e-local/ | 不把HTTP测试当浏览器E2E | 持久化各层代码已交付；新结果见总报告 | 不把此文档等同测试实现 |
| R28 | A §3.1 | README 含运行指南、环境变量配置、技术选型、主要 API 列表、已完成功能与后续改进 | README.md、.env.backend.example | 干净目录按README复现见总报告 | 当前运行、配置、API及限制已更新 | 环境变量示例不得含真实值 |
| R29 | A §3.1 | Git Commit 演进历史层级清晰，可见文档/结构/UI/测试/逻辑等渐进开发 | 本地Git完整历史；development-log | git log，archive快照不代替历史 | 真实渐进历史已正常推送；远程完整克隆及初始化提交祖先核验通过 | 用户暂定schen/cs064210@163.com；不照抄题面示例伪造提交顺序 |
| R30 | A §3.2 | 至少 5 段核心原始开发 Prompt，标出 SDD 数据建模/API 契约、DDD 前端组件/页面、TDD 测试与实现、E2E 系统测试/质量闭环 | sources/development-prompts.md精选索引 | P1/P3/P4/P6/P11/P12/P13等，不计应用提示词 | 至少5条真实原文覆盖SDD/DDD/TDD/E2E | 不扩写 SDD/DDD 英文全称；本轮长 Prompt 不能拆分冒充多段 |
| R31 | A §3.2 | 每段 Prompt 附 1–2 句说明：意图、挑战、如何引导 AI 修正 | 同上各Prompt说明；阶段日志 | 原文不改；阶段7仅追加P17 | 人工检查真实意图及问题说明 | 只记录实际发生的纠偏 |
| R32 | A §3.3 | 1–1.5 页开发过程思路/工作流说明：开发流程、2–3 个真实典型问题及解决路径、对工程化 AI 开发的理解 | workflow.md | 实际Codex、三真实案例；工具许可D05未确认 | 约1–1.5页Markdown工作流；版式口径另列 | D05：其中“Claude Code 结合 Deepseek V4 Pro”措辞冲突须确认；不能改写实际工具历史 |

## 建议与未确认事项登记

| 编号 | 类别 | 建议/问题 | 影响与处理 |
|---|---|---|---|
| D01 | B（1B确认） | 默认4位专家另加1位主持人，expertCount不含主持人 | 作为第一版默认解释，不把主持人算进专家数 |
| D02 | B（默认值）/D（长总结解释） | 专家1–8；running/stopping最多2场，不限历史数量和观察者数；模型并发每场2/全局4；完整响应30秒、单层重试总计最多2次；12次成功持久化专家发言或进入running后10分钟先到则收尾；收尾60秒含排队/调用/重试；总结暂为1–2句 | 不是题面给定数字，未验证性能/成本/模型能力；主持人发言、意愿和失败请求不计12次。长总结仍待出题方确认 |
| D03 | B（阶段2明确选用） | node:sqlite用于本轮正式草稿数据访问，已执行真实SQLite业务测试 | 不等于生产/高并发可靠性认证；业务层依赖DraftStore边界 |
| D04 | B（P8接入设置）/D（真实能力） | 开发用具体模型未核实；应用选定DeepSeek官方deepseek-flash、Chat Completions、非流式JSON、关闭thinking、max_tokens=4096 | Codex是已用开发工具；4D适配器本地通过，4D真实阵容及R1短讨论单样本已验证；完整语义质量/取消计费仍未验证；不估造价格/额度 |
| D05 | D | 题面任意 Vibe Coding 与指定 Claude Code/Deepseek V4 Pro 的差异 | 用户需向出题方确认；不声称获许可，不补造工具记录 |
| D06 | B（本机实验）/D（支持环境） | 用户已授权Windows10独立Edge优先，必要时匹配官方Chromium的可行性实验 | 不是官方支持认证；受支持环境仍待验证；不自动配置WSL或降级版本 |
| D07 | B（1B确认） | 仅将确实中断的running/stopping标为failed，保留记录不自动续跑；created/awaiting_confirmation/completed不误伤 | generating_lineup原C细节回created，在4A提案修订为lineup_generation_failed+LINEUP_INTERRUPTED（P6确认，4B已实现），不误归运行失败；不增加跨进程协调或无限重试 |
| D08 | C | 同一后端进程、单一本地 SQLite 文件，公开事件持久化并按讨论递增；数据不自动删除 | MVP 无通用消息代理/账户/分布式锁；清理策略以后另行确认 |
| D09 | D | 用户画像提到“可录制、可回放”的内容素材，但功能清单未定义录制/回放操作 | 本轮不设音视频、时间轴回放、录制导出为验收；持久化文字记录和查询明确纳入 |

## 设计草案的验收口径

功能验收依据 R 编号与 TEST 的对应场景。C 项经确认前仅用于说明可实施的默认方案；数字与恢复策略不能变成未告知的硬限制。人工质量审查与自动化测试分别记录；自动化可证明数据和调度行为，不足以证明讨论一定深刻。


## 阶段2来源与验收补充

本轮用户原文见P3。B类明确：专家缺省4、不含主持人、合法整数1–8；正式node:sqlite；草稿数量不受两场执行限制；真实TDD、无前端/模型/SSE扩展。沿用原契约的requestId幂等、400/404/409/500和字段白名单。C类具体补充：列表updatedAt降序、discussionId升序；本机端口默认3000及data/discussions.sqlite路径。话题500码点源于已有契约，不改写为原题要求。

需求对应与真实结果见test-plan的S2矩阵及stage-2-validation；R09/R14公开边界仅验证了当前HTTP/DTO及受控错误，不代表未来模型内容或浏览器安全已验收。

## 阶段3来源与验收补充

P4及暂定Git身份原文已追加归档，原有Prompt与题面未改。B类授权中文草稿首页/详情、React+Vite、局部E2E、仅frontend-design项目级安装与当前仓库提交。具体三尺寸是本轮验收尺寸，不是题面数字。S3矩阵映射R02/R03/R13/R17/R20/R22/R27；不把草稿观察等同运行中的Agent观察。测试草稿不计入R25的5组话题及阵容。

## 阶段4A来源与冲突登记

P5是B类本轮范围：1 moderator+expertCount expert；职业profession与title分开；系统ID/颜色/时间/版本不由模型控制；确认阵容不得自动开始；只做设计，不实施迁移或调用模型。对应R04/R09/R13/R14/R15/R20/R22/R26，具体设计见[lineup-design.md](lineup-design.md)，S4-01–32全部为未来计划。

C类待确认推荐：沿用generating_lineup/awaiting_confirmation，加lineup_generation_failed/lineup_confirmed；当前代次存Discussion，不另建attempt表；生成中不强制替换，失败新代次可重试；旧阵容暂存但失败不开放确认；严格001接管与002事务重建。状态名、错误码、调色板和文本阈值均非原题原话。旧确认即/start和Role.kind/host约定与本轮要求不一致，已在设计正文明确修订；历史Prompt/阶段2、3报告保持原样，不冒充过去已采用新方案。

## 阶段4B来源与完成边界

P6为B类：确认4A全部阵容决定并授权当前会话实施；严禁真实模型、讨论调度/SSE、完整阵容操作UI。原C类命名/默认值/迁移规则经P6确认成为本阶段B类设计基线，仍不冒称题面原话。R04只完成Fake生成/确认后端及状态兼容；R13/R15/R22对应迁移/隔离/运行时校验子集已验证；原运行、真实模型、完整交付要求保留未完成。S4矩阵已映射实际测试与剩余边界，阶段2/3历史报告及原题/Prompt保持原文。
