# 测试与验收计划

**原T01–T20完整场景仍为“计划”；阶段2草稿子集已实际执行，独立列于下方S2矩阵，不将HTTP集成称作完整产品E2E。阶段1B没有执行产品测试。** 阶段1B已实际执行的独立环境探针见[环境验证报告](environment-validation.md)，不等同这里的T01–T20，也不是核心业务TDD。

## 分层与证据

- **单元**：Vitest验证校验器、状态转移、版本接受条件、协调选择；可控时间用于超时逻辑，不能用固定轮转替身绕过真实协调器。
- **集成**：真实SQLite临时数据库、真实数据访问层、Express接口和SSE事件写入/补发；仅外部模型边界可替身。测试数据库与用户运行数据库分离，每个测试隔离数据。
- **系统E2E**：项目内持久化 `@playwright/test` 测试文件，启动真实前端、后端、SQLite、HTTP/SSE；仅外部模型HTTP服务或模型适配器服务边界使用可控替身。不得mock浏览器业务API、内部调度或SSE流来假装系统完成。
- **真实模型接入检查**：后续单独授权、配置后执行，记录实际提供商/模型ID、时间、任务种类、成功/错误与必要脱敏证据；不把替身调用写成真实模型运行。
- **人工讨论质量审查**：检查回应是否相关、有实际反驳/补充、主持是否有效、共识证据是否成立、1–2句是否自然；自动结构测试不能证明这些语义质量。

浏览器用业务条件等待：按钮状态、可见发言、特定版本、终态、连接恢复；使用可重试断言，不以固定sleep作为主要完成判断。模型替身通过显式请求屏障释放响应，可复现超时、迟到和交错；不依赖随机时间碰撞。

## 场景矩阵

| 用例 | 层次/需求 | 前置条件 | 操作 | 预期结果 | 状态 |
|---|---|---|---|---|---|
| T01 创建与列表 | 集成/E2E；R02 R03 | 空库，真实UI/API，模型替身待命 | 填写中文话题及4专家，创建后请求阵容；另一观察页打开列表 | 生成1个discussionId，expertCount=4；active可见；GET不启动模型；空态/加载/错误可区分 | 计划 |
| T02 阵容校验 | 单元/集成/E2E；R03 R04 R20 R22 | created；提供错误人数/缺profession/title/重复moderator/额外隐藏字段的模型响应 | 请求lineup，先无效再有效；另测所有尝试均无效 | 无效输出不保存为可确认阵容；只按有限次数尝试；有效时恰好1主持人+N专家及完整颜色身份；耗尽进入lineup_generation_failed+安全notice（4A提案） | 计划 |
| T03 确认门槛 | 单元/集成/E2E；R04 R20 | created、generating_lineup、awaiting_confirmation分别准备 | /lineup/confirm传旧版本或正确双版本，两观察者并发确认 | 前两状态不可确认；旧版409；正确版仅一次迁移到lineup_confirmed、无开场；未来运行门槛另行验收（4A修订） | 计划 |
| T04 普通发言结构 | 单元/集成；R07 R22 | 已启动，模型返回0/3句、空串、JSON正文、HTML、跨讨论replyTo | 逐项提交边界响应；再提交合法1/2句 | 无效正文不入库、不发utterance.created；合法普通发言有单调seq；中文句界歧义列入人工检查 | 计划 |
| T05 当前内容影响回应 | 单元/集成/E2E；R05 R06 R08 R20 | 最新transcript=v含可辨识观点A；真实协调器；替身按所收到transcript选择回应 | 发布新观点B，再释放下一轮意愿/发言请求；检查提供商边界收到的输入 | 请求包含本场最新B及正确角色；不含他场文本；协调器按新意愿选择；UI显示真实preparing/idle和公开关注点；不把此测试称为真实模型语义验证 | 计划 |
| T06 非固定轮转/非剧本 | 单元/集成/E2E；R06 | 固定阵容，但替身依当前已发布内容让同一专家两轮有回应意愿 | 推进两轮，检查每次请求时点/输入及公开发言序列；将第二轮最新内容替换后另跑独立场景 | 可出现同一专家连续回应，改变内容改变选择；下一轮公开发言请求发生在先前transcript提交之后；不存在开始时一次性取得整场script的路径 | 计划 |
| T07 讨论中综合 | 集成/E2E；R10 | running，第一条专家发言已提交，后续模型请求暂停 | 释放综合响应，结束前查看共识和分歧，再发布新观点并更新 | 未结束时出现synthesis.updated；引用真实本场发言；新增版本整体替换；空items不捏造共识；证据点击定位正确 | 计划 |
| T08 两讨论隔离 | 集成/E2E；R02 R15 | 两场不同话题/角色/数据库记录，模型响应可交错 | 同时start，分别订阅，交错发布；stop其中一场 | 请求上下文、事件、发言、状态和综合都不跨场；一场停止不取消另一场；跨场引用被拒绝 | 计划 |
| T09 多观察者/重复操作 | 集成/E2E；R15 R16 | 一场已确认，有两浏览器上下文 | 同时观察、刷新、断开一个观察者；重复create相同requestId/相同和不同输入；重复start、stop | 观察不产生额外开场/模型任务；同请求同输入复用创建结果，异输入409；start/stop幂等，重复终结不重复总结 | 计划 |
| T10 快照/断线/去重 | 集成/E2E；R16 | 快照游标k；可控制连接建立与事务提交时点 | 在快照和SSE连接间提交事件；断线时再提交；重连发送Last-Event-ID；注入重复/旧/缺口/不可补发控制情形 | 不漏间隙事件；header优先于旧after；重复不重复显示；同dataVersion不同eventId全部应用；缺口走stream.reset后重取快照；旧连接失效 | 计划 |
| T11 结束及迟到结果 | 单元/集成/E2E；R12 R15 | running，意愿/发言/综合各有可控未完成请求 | stop两次，再释放旧结果；仅释放新代次冻结transcript上的1–2句总结；另测排队占满60秒及总结超期到达 | 旧代次无发言/综合落盘；stop只一次总结；stopping→completed；总结失败或收尾总期60秒耗尽为unavailable且保留记录，迟到总结不覆盖终态；用户可见中文状态 | 计划 |
| T12 旧综合保护 | 单元/集成；R10 R15 | 模拟两个不同源版本的综合任务完成次序，与真实数据库提交条件一致 | 先提交新v综合，后释放旧v-1；另测v结果到达时transcript已是v+1 | 旧版本不覆盖新版本；过时但较已应用版本新的结果也不被当作当前综合；角色/证据归属检查仍执行 | 计划 |
| T13 公开边界/密钥 | 单元/集成/E2E；R09 R11 R12 R14 R22 | 仅使用明确的测试哨兵字符串，绝不读取真实密钥；响应包含隐藏字段、意愿、原始JSON、栈和HTML | 遍历正常/失败HTTP、SSE、快照、浏览器DOM/资源及可观测日志 | 公开白名单不含内部字段；测试哨兵不出现在前端/日志；不展示隐藏推理或JSON正文，不执行HTML；用户错误中文且脱敏 | 计划 |
| T14 超时/无效/无人/并发 | 单元/集成；R06 R20 R22 | 控制时钟/响应，按D02已确认参数配置上限 | 意愿全空、多申请、一个超时、发言全失败、认证错误、综合连续失败；提交超过运行容量 | 有限尝试、无无限等待；多人集中协调；无人经一次主持追问再无回应则收尾；认证错误不重试；并发不超上限；容量返回429；主持人/失败请求/意愿不计12次专家发言；重试只有一层；模型等待不占数据库写事务 | 计划 |
| T15 中文与滚动 | E2E/人工；R02 R08 R11 R17 | 实际UI，大量长中文发言/角色；超宽、桌面、窄屏及短视口 | 分别滚动各区，向上阅读时发布新消息，切换窄屏标签，键盘操作和错误状态 | body不承担正文滚动；目标区scrollTop变化而其他区保持；无水平溢出；身份不只靠颜色；文本清晰、焦点可见、未读提示不强制跳底 | 计划 |
| T16 文档/过程/交付 | 人工交付检查；R18 R19 R23–R32 | 最终仓库与原始开发记录，当前仅草案 | 对照需求、文档、源码、Git日志、Prompt、样例、README、工作流说明逐项核验 | 至少5段真实核心Prompt覆盖四阶段且每段1–2句说明；5组话题+阵容；所需源码/初始化/测试/文档/链接齐全；工具历史真实；1–1.5页说明有2–3个真实问题；不以本轮建档当最终通过 | 计划 |
| T17 真实模型连接 | 真实模型检查；R04 R06 R10 R14 | 用户另行授权，已确认实际模型与协议，后端环境安全配置 | 各任务最小调用，观察结构化输出、延迟、限流/取消行为及真实语义；记录实际结果 | 成功或失败均据实记录；不要求模型泄露推理；不夸称供应商支持未测试能力；与替身测试报告分开 | 计划 |
| T18 讨论质量/样例 | 人工；R01 R05 R06 R07 R10 R25 | 至少5组话题/阵容；真实运行样本与合成样例标签区分 | 审查回应依赖、补充反驳、主持追问串联、句子自然性、证据支持综合 | 明确列出具体优点/问题及关联发言ID；不以格式合格替代质量；不把生成文本当事实验证或专家真身 | 计划 |
| T19 SQLite/重启 | 集成/运行检查；R13 R28 D07 | 真SQLite文件、迁移/初始化，预置各生命周期状态 | 重启后端，读快照；验证外键、事务回滚、事件原子性、记录查询 | 仅中断running/stopping转failed、角色idle、旧任务不续跑；created/awaiting_confirmation/completed保留；generating_lineup按4A提案进入lineup_generation_failed提示中断；数据事件一致；没有提交运行数据库或依赖私有缓存 | 计划 |
| T20 安装与系统执行 | 环境/E2E；R13 R20 R21 R27 | 明确受支持环境与项目锁文件，测试文件已实现后 | 按README从独立目录安装并运行真实系统E2E | 可复现启动、持久化与退出码；报告真实版本和环境；Win10实验若可运行也不声称官方支持 | 计划 |

T12故意构造错序是验证提交防护，不表示MVP默认无限并行生成综合。T19未来才执行运行态恢复；阶段2已有草稿初始化与重开读取，但没有运行态迁移/恢复实现。

## 真正TDD的实施顺序（阶段2已用于草稿子集）

1. 先选单一行为与R/T编号，例如“未确认不可启动”，写最小可运行测试。
2. 运行并记录失败原因，确认是目标行为未实现，而非缺依赖/语法错误。
3. 写刚好满足该行为的实现，重新运行并保存结果；必要时重构后复验。
4. 扩展到真实数据库、HTTP/SSE集成，再串起E2E；每次只记录实际执行的检查和结果。
5. 测试替身验证系统控制流；真实模型能力和讨论质量用T17/T18单独补充。不能因替身成功就交付“真实AI已经验证”。

## 当前未执行

原T01–T20整场讨论场景、SSE补发/观察、完整讨论Playwright系统E2E、真实模型和人工讨论质量仍未执行。阶段2已执行草稿单元/SQLite/HTTP集成，见下表；阶段1B环境结果仍独立。



## 阶段2草稿模块实际验证矩阵

所有用例为持久化测试，最终次数/退出码统一见[阶段2记录](stage-2-validation.md)。下表为测试职责分组，不将每一行重复算成独立测试；总计38项单元+41项集成。

| 编号/对应需求 | 层次/文件 | 前置条件 | 操作 | 预期 | 当前状态 |
|---|---|---|---|---|---|
| S2-01 R03 R22 | 单元 tests/unit/input.test.ts | 原始unknown输入 | 中文、引号、内部空格、500/501码点；人数缺省/1/8/非法类型；错误对象/UUID/系统字段 | 正确规范化，默认只用于缺省，非法拒绝 | 38项通过 |
| S2-02 R13 | 集成 tests/integration/schema.test.ts | 全新独立SQLite | initializeDatabase | 仅两必要表，外键开启 | 1项通过 |
| S2-03 R02 R03 R13 R15 R16 R22 | 集成 tests/integration/drafts.test.ts | 每例全新SQLite和真实业务层 | 创建/查找/重复请求/四份同题草稿/非法输入/引号及NUL话题/关闭重开/重复初始化；SQLite触发器仅注入事件写故障 | created完整白名单、独立ID、无部分数据、幂等/409、持久化、首事件一致事务回滚；故障解除可重试 | 14项通过 |
| S2-04 R02 R15 | 集成 tests/integration/list.test.ts | 空库或本例创建三条不同时间草稿 | active/all、同时间排序、非法过滤 | 空态合法、草稿不误标活动、updatedAt降序及ID升序，字段/数据独立 | 8项通过 |
| S2-05 R02 R14 R16 R22 | HTTP集成 tests/integration/http.test.ts | 每例真实Express临时回环端口、真实SQLite | 实际fetch创建/查询/列表/并发重试/400/404/409/500/16KiB/Origin及Content-Type | 契约状态与错误五字段；不泄露SQL/路径/栈，正常读写非mock；finally关闭服务与库 | 18项通过 |
| S2-06 R13 R28 | 运行检查 scripts/http-smoke.mjs | 正式编译产物、全新smoke库 | 初始化、启动、POST/GET、正常退出、再初始化/重启/GET | 201/200、跨进程重开仍可读、两服务正常退出、监听关闭 | 已执行通过；不计入79项Vitest |

受控错误只使用SQLite触发器，不把正常读写换成替身。未创建主持人/专家记录、没有调用模型或事件总线；草稿首事件持久化不代表SSE链路通过。探针9项与浏览器1项不计入本轮79项。

## 阶段3草稿界面实际验证矩阵

本轮18项前端单元、9项局部E2E及79项后端回归均通过，退出码0；命令和失败证据见[阶段3记录](stage-3-validation.md)。下列是职责分组，不将每行或每断言重复计数。T01–T20完整讨论场景仍为计划。

| 编号/需求 | 层次/文件 | 前置条件 | 操作 | 预期与实际结果 |
|---|---|---|---|---|
| S3-01 R03 R22 | 单元 web/tests/api.test.ts | unknown响应及输入 | 人数非法、500/501码点、缺/多字段、状态/ID错、200/201及错误HTML | 严格校验、固定安全错误；11项通过 |
| S3-02 R02 R15 R20 | 单元 web/tests/controller.test.ts | 可控异步API边界 | 重入、失联重试、编辑/再次提交、409、列表失败、旧详情/列表及错误恢复 | ID/正文生命周期正确，旧回调不覆盖；7项通过 |
| S3-03 R02 R03 R13 | 局部E2E e2e/drafts.spec.ts及interaction.spec.ts正常组 | 真实前后端SQLite，独立输入 | 默认4/另选8、active/all、详情、刷新、非法输入、Unicode与HTML文本 | 数据真正保存/重读，不显示HTML节点、不虚构状态；3项通过 |
| S3-04 R02 R15 R22 | 局部E2E interaction.spec.ts故障组 | 同真实链路，仅网络故障注入 | 后端提交后丢响应、重复点击、列表500、延迟旧详情、详情500恢复 | 原ID重试仅一条记录，保存与列表错误分离，旧结果不覆盖；3项通过 |
| S3-05 R17 | 局部E2E e2e/layout.spec.ts | 390×844、1366×768、2560×1080，新建独立布局数据 | 键盘聚焦、三区访问、长话题、滚动及窄屏往返 | 无页面横向溢出，主操作初始可见、分区滚动和状态保留；3项通过，截图另行目视检查 |

所有业务等待按角色/标签、可见状态、响应和expect.poll；不靠固定休眠或networkidle。正常链路用真实Express、SQLite和React；标注故障测试不等于真实服务器产生该错误。截图只证明本机Edge视口布局，不证明真实移动设备、屏幕阅读器或整个产品质量。无阵容、SSE、真实模型与人工讨论质量测试。

## S4：4B实际测试映射与后续边界

设计依据[lineup-design.md](lineup-design.md)与contracts的阶段4A节。P6确认后已按实施计划执行真实RED→GREEN；最后一列给出真实测试文件和剩余边界，结果见stage-4b-validation。unit为纯校验/状态决策；DB integration用真实临时SQLite、业务和repository；HTTP integration用真实Express请求链路；E2E在4C阵容UI完成后使用真实前后端SQLite、仅FakeRosterProvider；real-model check另行授权，不能算Fake测试通过。

| 编号 | 层次 | 前置 | 操作 | 预期 | 状态 |
|---|---|---|---|---|---|
| S4-01 | HTTP integration | created草稿、Fake受控 | 新requestId及null基代次请求/lineup | 202，生成代次1；GET无副作用 | 已通过4B范围：tests/integration/lineup-http.test.ts |
| S4-02 | unit / HTTP integration | generating/confirmed及未来运行状态决策样例 | 不同requestId再次生成 | 按契约409，Provider不调用；未来状态用纯决策样例，不绕过002约束写运行记录 | 已通过4B范围：tests/unit/generation.test.ts；tests/integration/lineup-http.test.ts |
| S4-03 | DB integration | 已持久化中文话题和人数 | 生成、失败、再生成、确认 | topic/count/createdAt逐字不变 | 已通过4B范围：tests/integration/generation.test.ts；confirm.test.ts |
| S4-04 | unit / HTTP integration | N=1/4/8，Fake正常候选 | 释放1主持人+N专家JSON | ready，完整职业/头衔、成员ID/排序 | 已通过4B范围：tests/unit/lineup.test.ts；fake-roster.test.ts；tests/integration/generation.test.ts |
| S4-05 | unit | 分别少/多专家、无/双主持人 | 验证候选 | 全部业务无效，无静默裁剪/补造 | 已通过4B范围：tests/unit/lineup.test.ts；fake-roster.test.ts |
| S4-06 | unit | 空白/缺字段、非法role、同名含空白/NFKC变化 | 验证每组候选 | 分类准确，重复跨角色也拒绝；同职业不同名允许 | 已通过4B范围：tests/unit/lineup.test.ts |
| S4-07 | unit / DB integration | 模型带color/order/ID及合法候选 | 先验证恶意字段再正常生成 | 未知系统字段拒绝；系统主持人0专家1…N，固定色不重复 | 已通过4B范围：tests/unit/lineup.test.ts；tests/integration/generation.test.ts |
| S4-08 | unit / HTTP integration | Fake等待，受控时钟 | 两次超时至总期限 | 最多2调用，failed/LINEUP_TIMEOUT，GET200 | 已通过4B范围：tests/integration/generation-resilience.test.ts（受控60秒）；lineup-http.test.ts（分类HTTP） |
| S4-09 | unit / HTTP integration | 临时网络故障、另例永久配置错误 | 释放分类错误 | 临时最多重试1次；永久不重试，固定notice不泄漏异常正文 | 已通过4B范围：tests/integration/generation.test.ts；lineup-http.test.ts |
| S4-10 | unit | 非JSON、围栏、根数组、未知字段、字段类型错误 | parse及结构校验 | LINEUP_INVALID_STRUCTURE；不抽取猜测JSON | 已通过4B范围：tests/unit/lineup.test.ts |
| S4-11 | unit | 字符串合法但超长/空值/错误人数/重复 | 业务验证 | LINEUP_INVALID_MEMBERS；归一化视图一致 | 已通过4B范围：tests/unit/lineup.test.ts |
| S4-12 | unit | 首次网络失败后二次结构错误；另例首次业务错 | 推动重试/修复 | 总次数最多2；第二例仅给安全规则反馈，不回传raw；无第三次 | 已通过4B范围：tests/integration/generation.test.ts |
| S4-13 | DB integration | 旧空阵容或既有完整阵容；新候选非法 | 完成失败 | 无半组成员；旧完整存储保留且公开失败roles为空 | 已通过4B范围：tests/integration/generation.test.ts |
| S4-14 | DB integration | 合法候选，成员写入或事件写入故障点 | 事务成功及受控失败两例 | 成员/版本/状态/事件共同提交或全回滚，FK有效 | 已通过4B范围：tests/integration/generation-resilience.test.ts；confirm.test.ts |
| S4-15 | DB integration / HTTP integration | 精确001旧schema，已有草稿/幂等ID/事件/引号及NUL话题 | 升002，再原路径查询与创建重放 | 旧字段/事件字节不变，created19字段兼容，唯一键有效 | 已通过4B范围：tests/integration/migrations.test.ts；drafts.test.ts；http.test.ts（升级后原API回归） |
| S4-16 | DB integration | 已完成002 | 再执行迁移 | 无重建、无重复行，applied_at/业务版本不变 | 已通过4B范围：tests/integration/migrations.test.ts；runtime.test.ts |
| S4-17 | DB integration | 精确旧schema，新表复制后及登记版本后分别注入失败 | 升级 | 全事务回滚，旧数据/表可读、无半迁移记录，finally外键ON | 已通过4B范围：tests/integration/migrations.test.ts（复制CHECK故障、记录后完整性故障） |
| S4-18 | DB integration / HTTP integration | ready旧整组 | 新requestId+当前代次重新生成 | 生成时旧组保留但不公开；成功整组新ID替换，无混合版本 | 已通过4B范围：tests/integration/generation.test.ts |
| S4-19 | unit / DB integration | A超时failed，B请求并先成功；Fake A忽略取消 | 最后释放A成功及失败回调 | B的成员/版本/notice/事件不变；仅内部stale诊断 | 已通过4B范围：tests/integration/generation-resilience.test.ts（成功/失败迟到） |
| S4-20 | HTTP integration | B ready，持有A确认body | 确认A，再确认B | A409 STALE_LINEUP；B200且不启动讨论 | 已通过4B范围：tests/integration/lineup-http.test.ts；confirm.test.ts |
| S4-21 | DB integration / HTTP integration | 当前ready，两个观察者 | 并发相同确认、确认后再重复 | 一次确认事件，固定confirmedAt，后者replayed:true | 已通过4B范围：tests/integration/lineup-http.test.ts；confirm.test.ts |
| S4-22 | HTTP integration | lineup_confirmed | 原生成ID重放及新生成ID | 均409 INVALID_STATE，不改已确认成员 | 已通过4B范围：tests/integration/lineup-http.test.ts；confirm.test.ts |
| S4-23 | HTTP integration / E2E（4C） | ready已持久化 | 重新GET、重开数据库；4C刷新页面 | 同ID/字段/颜色/order可读，刷新不重复生成 | 已通过4B范围：tests/integration/confirm.test.ts；lineup-http.test.ts；scripts/http-smoke.mjs --lineup；4C完整阵容UI仍未执行 |
| S4-24 | unit / HTTP integration / E2E（4C） | Fake含隐藏键/异常栈/测试哨兵 | 生成失败、GET、检查可见日志/DOM | 无原始输出、内部ID字段或隐藏诊断泄漏；只安全白名单 | 已通过4B范围：tests/unit/lineup.test.ts；tests/integration/lineup-http.test.ts；web/tests/lineup.test.ts；4C完整阵容UI仍未执行 |
| S4-25 | HTTP integration | 同一生成requestId、同/异基代次，A被B替代 | 重放各body | 当前同键按202/200；异输入409；旧代次409，不重调模型 | 已通过4B范围：tests/integration/lineup-http.test.ts；generation.test.ts |
| S4-26 | DB integration / HTTP integration | 进程遗留generating；另有created/ready/confirmed | 启动恢复并查询 | 仅遗留生成失败+事件，其他不变；不自动续跑 | 已通过4B范围：tests/integration/confirm.test.ts；generation-resilience.test.ts |
| S4-27 | unit / DB integration | 两场交错任务、伪造跨场generation/member引用 | 验证及提交 | CAS/复合外键阻止跨讨论串数据 | 已通过4B范围：tests/integration/generation.test.ts（两场交错）；generation-resilience.test.ts；migrations.test.ts |
| S4-28 | HTTP integration | 全局槽满、受理CAS失败、Provider超时 | 请求/释放资源 | 429不留生成记录；回滚释放槽；有限预算，无无限队列 | 已通过4B范围：tests/integration/lineup-http.test.ts；generation-resilience.test.ts |
| S4-29 | DB integration | 早期length(topic)库、半表、未知触发器、缺号或checksum变化 | 尝试迁移 | SCHEMA_MISMATCH等明确停止，无“修好”或删除未知数据 | 已通过4B范围：tests/integration/migrations.test.ts |
| S4-30 | HTTP integration | 成功写入失败且失败状态提交也失败 | 完成任务、GET，再恢复启动 | 两次事务均无半数据，进程内503，重启恢复持久化后才接请求 | 已通过4B范围：tests/integration/lineup-http.test.ts；generation-resilience.test.ts |
| S4-31 | HTTP integration / E2E | 阶段3创建/列表/详情功能及新版DTO | 回归旧created；已生成记录的创建幂等重放 | 原79/18/9相关行为保持，联合解码接受新快照且不放宽未知字段 | 已通过4B范围：tests/integration/http.test.ts；web/tests；e2e原9项及lineup-compat.spec.ts |
| S4-32 | real-model check | 后续用户授权实际协议/模型、后端安全配置 | 最小阵容请求、结构/超时/取消/修复记录 | 据实记录能力、延迟、格式/多样性问题；不从Fake推断真实质量 | 未执行：真实模型未接入，无付费调用 |

S4-15/17/29均由测试创建独立临时旧库，不使用或清空用户库；故障注入只用于错误路径，正常迁移/HTTP链路真实执行。E2E需4C UI，不能将4B HTTP集成升级称作UI通过。真实模型与人工成员质量未执行；色板数字检查也不是UI验收。

### 4B计数与不冒领范围

最终后端190项＝99项单元（旧输入38、候选38、Fake13、状态10）＋91项SQLite/HTTP集成。HTTP29项（原18＋阵容11）、迁移12项、维护入口2项都计入91，不额外相加。前端25项＝原18＋兼容7；Edge局部E2E10项＝原9＋API驱动状态兼容1。两个独立进程冒烟另计运行检查。最终命令与退出码见stage-4b-validation。

S4-23/24的HTTP/DB边界已测试，4C完整卡片/按钮与冲突恢复交互未执行。S4-15迁移与HTTP由各自真实集成组合覆盖；S4-26恢复包括created/ready/confirmed保留及遗留生成失败，不代表所有进程崩溃/磁盘断电情形已验证。S4-32及人工质量仍为计划。T01–T20整场讨论/SSE未因本轮阵容测试自动通过。

## 阶段4C实际验收（P7，2026-09-16）

下表覆盖本次24项重点。前置为独立构造的指定snapshot或新建真实草稿；操作和预期由每行对应测试名称定义（测试文件中完整断言）。panel=web/tests/lineup-panel.test.tsx；controller=web/tests/lineup-controller.test.ts；api=web/tests/lineup-api.test.ts；新E2E=e2e/lineup.spec.ts。单元测试模拟HTTP API边界，系统局部E2E正常路径为真实React/Express/SQLite，仅外部Provider为Fake；500/503及请求等待为明确网络故障注入。

| 编号 | 前置、操作和预期 | 实际测试 | 状态 |
|---|---|---|---|
| S4C-01 | created生成入口 | panel: created；E2E正常闭环 | 通过 |
| S4C-02 | 生成防重 | controller: synchronous busy；E2E同一事件循环 | 通过 |
| S4C-03 | 生成中禁确认/再生成 | controller: forbids/only ready；panel: generating | 通过 |
| S4C-04 | 生成中刷新轮询 | controller: two-second；E2E生成中刷新 | 通过 |
| S4C-05 | 1主持人+N专家 | panel: ready；E2E 1/4/8人数 | 通过 |
| S4C-06 | 职业/头衔/立场/颜色 | panel: identity fields；E2E长字段 | 通过 |
| S4C-07 | ready双操作 | panel: ready；E2E正常闭环 | 通过 |
| S4C-08 | 确认真实双版本 | api/controller: exact versions | 通过 |
| S4C-09 | 确认后confirmed | controller: confirmed；E2E正常闭环 | 通过 |
| S4C-10 | 非409确认失败保留 | controller: 500/503/0；E2E500/503 | 通过 |
| S4C-11 | 409恢复最新 | controller: reloads；E2E409及双Tab | 通过 |
| S4C-12 | 重生成受理隐藏旧卡片 | controller: accepted result；E2E重新生成 | 通过 |
| S4C-13 | 重生成失败不恢复旧版 | controller: older snapshot；E2E重新生成失败 | 通过 |
| S4C-14 | 失败新代重试 | controller: retry/uncertain POST；E2EProvider失败重试 | 通过 |
| S4C-15 | confirmed只读 | panel: read-only；E2E confirmed刷新 | 通过 |
| S4C-16 | ready刷新 | E2E正常闭环 | 通过 |
| S4C-17 | confirmed刷新 | E2E正常闭环 | 通过 |
| S4C-18 | 切换讨论隔离 | controller: late generate/confirm/poll；E2E切换 | 通过 |
| S4C-19 | 多Tab旧版本恢复 | E2E两个Tab | 通过 |
| S4C-20 | 离线非业务失败 | controller: offline/network GET；E2E浏览器离线 | 通过 |
| S4C-21 | 联网继续GET | controller: online；E2E浏览器离线 | 通过 |
| S4C-22 | 上限不修改status | controller: 60 polls及恢复预算 | 通过 |
| S4C-23 | 内部错误不入UI | api: safe HTTP/strict DTO；panel: escaped text；E2E500/503 | 通过 |
| S4C-24 | 阶段3回归 | 原18前端及原9E2E全部执行 | 通过 |

本轮前端68项＝原25＋新增43（API7、Controller28、Panel8）；本轮E2E26＝原10＋新增16。4B兼容用例保留真实API状态回归，旧“没有按钮/卡片”断言按P7改为新界面断言，不将旧阶段限制延续到本轮。后端190项全部回归，未修改后端测试或业务。

S4-23/24的4C卡片/刷新/公开边界部分现已验证；S4-32真实模型仍未执行。T01–T20整场讨论、SSE、发言和共识等仍只保留既有计划。完整结果、退出码和RED→GREEN见stage-4c-validation。自动等待依据业务状态，生产轮询有2秒间隔；假时钟模拟60次上限，不让E2E固定休眠两分钟。

## 阶段4D本地测试对应（真实联调仍未执行）

| P8要求 | 实际覆盖 |
|---|---|
| 1 URL/参数/dummy鉴权 | unit/deepseek.test + integration/deepseek-http.test（native fetch loopback） |
| 2 缺配置零请求 | unit/deepseek-config/deepseek/backend-config |
| 3 有效正文进入现有管线 | integration/deepseek-pipeline（SQLite保存、确认、事件） |
| 4 空/结构/人数/字段错误 | unit/deepseek；integration/deepseek-pipeline |
| 5 finish截断/过滤/异常 | unit/deepseek；integration/deepseek-pipeline |
| 6 reasoning/秘密/原始错误不公开 | unit/deepseek指标白名单；integration/deepseek-pipeline公开事件检查 |
| 7 账号/参数问题不重复 | unit/deepseek；integration/deepseek-pipeline 400/401/402/422 |
| 8 两次共享预算 | integration/deepseek-pipeline transport→invalid、invalid→repair；guarded-roster |
| 9 首次成功一次 | integration/deepseek-pipeline/guarded-roster |
| 10 正文延迟/空行受期限 | integration/deepseek-http（实际socket关闭） |
| 11 取消/迟到/过期代次 | integration/deepseek-http；deepseek-pipeline stale failure；原generation-resilience回归 |
| 12 不fallback | config/deepseek-pipeline/guarded-roster永久错误 |
| 13 常规测试不加载真实配置 | 所有新传输显式注入；普通server/E2E继续显式Fake，backend-config只由显式检查/live入口导入 |
| 14 拒第三次/第二场 | unit/live-authorization（含重建对象模拟重启）；integration/guarded-roster |

本地新增64项全部通过；前置均为dummy配置、临时文件/SQLite或loopback stub，不读取真实密钥。RED证据与最终254后端/69前端/26Fake E2E见stage-4d-validation。S4-32实际模型检查保持未执行，等待配置交接，不能据本地通过改成真实联调成功。

## 阶段5A：讨论运行与SSE验收矩阵（全部计划）

上文4D“等待交接”是4D-A历史语境；4D-B指定单样本阵容实证见stage-4d-validation末节，不覆盖下面任何讨论用例。本轮没有重跑254/69/26或其他产品测试，未执行迁移。新规格为[discussion-runtime-design.md](discussion-runtime-design.md)与contracts末节，待用户确认。

下表所有用例状态均为**计划**。U=单元，I=真实SQLite/HTTP集成，S=SSE真实传输集成，E=浏览器系统E2E，Q=未来真实模型及人工质量审查。5B做U/I；5C做S/E及相关回归；Q必须另行授权。Fake只替代外部讨论Provider，正常状态机/存储/HTTP/SSE/UI不可整体mock；每例独立临时数据库，不触碰业务库与4D验收库。

| 编号 / 需求 | 层次 | 前置 | 操作 | 预期 | 状态 |
|---|---|---|---|---|---|
| S5-01 R04 R22 | U/I | 五种阵容态分别准备 | start合法/缺字段/旧generation或revision | 只有当前已确认阵容可新运行；400/404/409准确，无非法任务/事件 | 计划 |
| S5-02 R15 | U/I/E | 同场confirmed，两个Tab不同requestId | 并发start，再重放同键及异绑定 | 仅一runId/runner/开场；匹配重放200，异绑定冲突；终态新start不重新开播 | 计划 |
| S5-03 R15 D07 | I | start已提交、runner尚未登记故障点 | 同进程登记失败；独立案例重启 | 前者安全failed，后者监听前RUN_INTERRUPTED；不因GET/重放而补发开场 | 计划 |
| S5-04 R15 R16 | I/S/E | 一场running，Provider门闩暂停 | GET、刷新、第二观察者、断线重连 | Provider计数与runner数量不增加；断线不停止讨论 | 计划 |
| S5-05 R06 | U/I/E | v内容A，不同专家条件式Fake | 发布B再开始下一轮意愿/发言 | 输入包含本场最新B，选择依申请与引用变化，无全场script；可连续同专家两次 | 计划 |
| S5-06 R06 R08 | U/I | 多人申请、响应顺序交错 | 改变返回先后；持续申请3轮；同人最近两次 | 相同输入选择相同；优先持续申请；有他人时不第三次连续；无申请不硬拉轮流，无隐藏评分 | 计划 |
| S5-07 R05 R06 | U/I | 全部明确不申请；另一案例全部超时 | 主持一次澄清再征集 | 仍无人→no_participation收尾；全故障不误称沉默；主持介入最多2，失败不编造发言 | 计划 |
| S5-08 R06 R07 | U/I | 部分专家失败、多个有效候选 | 被选发言两次无效再选下一位 | 单人失败不阻止其他候选；沿用同v有效意愿；v变动或token过期则丢弃 | 计划 |
| S5-09 R07 R09 R22 | U/I | 0/3句、空串、单项多句、160/161码点、引文/JSON/HTML/隐藏字段 | 校验及有限修复；另给合法1/2句 | 真校验，不截断、不补句；无效不落库；语义安全不由格式测试冒领 | 计划 |
| S5-10 R08 R15 | U/I | speech(v)未返回 | 提交其他角色小窗状态，再释放speech；另一案例改transcript | 仅snapshot.version变仍可提交；内容v变则旧结果无效；speaking来自真实提交，无定时假活动 | 计划 |
| S5-11 R11 R13 R16 | I | 合法候选，事件INSERT或成员/发言约束故障 | 提交与故障两例 | 发言/seq/计数/角色状态/事件全提交或全回滚；前端无未提交正文；Provider等待不持有写事务 | 计划 |
| S5-12 R10 | U/I/E | 第一位expert已提交，未结束 | 释放综合，再继续下一轮 | 讨论中更新，引用真实ID；同一专家或主持复述不够共识；空items合法；N=1不造一致意见 | 计划 |
| S5-13 R10 R15 | U/I | 不同source/task的综合响应交错 | 新结果先提交，再释放旧成功/旧失败 | 旧结果不覆盖/不改notice；source必须当前v且大于已应用source | 计划 |
| S5-14 R10 | U/I/E | 有旧综合，下一检查点失败 | 完成两次有限失败/随后另一案例成功空组 | 保留旧source并标failed；一个失败允许继续，连续2个收尾；成功空组清失败计数 | 计划 |
| S5-15 R12 R15 | U/I | 意愿/发言/综合均有可控迟到任务 | 用户stop与12次/10分钟同时竞争 | 仅一次stopping和冻结v；第一原因保留；取消旧epoch，迟到不提交；第12条不再启动普通任务 | 计划 |
| S5-16 R12 | U/I/E | stopping，独立summary门闩 | 重复stop、旧任务返回、释放新summary | 仅一个总结任务；旧取消不误杀总结；ready自然语言终态，刷新同一结果 | 计划 |
| S5-17 R12 D07 | U/I/E | 总结失败/无发言/收尾排队 | 推进60秒，释放迟到总结；重启stopping另例 | completed+unavailable明确提示；零发言不调用总结；迟到不覆盖；重启中断为failed而非正常完成 | 计划 |
| S5-18 R15 | U/I | 两场运行、第三场confirmed，另有阵容生成 | 交错调用/释放slot/结束一场 | 运行2场上限，第三start429；同场调用≤2全局≤4，阵容共享限制；排队有界，一场结束不取消另一场 | 计划 |
| S5-19 R20 | U/I | N=1/4/8、Fake可控错误/修复 | 接近84/168/280预算、普通上限、永久错误 | 发送前计数；两次共享每任务预算；留2次总结；耗尽收尾；每次/任务/run期限不被重试延长；无真实第三次探针 | 计划 |
| S5-20 R13 R15 | I | 真实002各阵容态含确认成员/旧事件 | 升003、重复迁移、故障回滚、未知schema | 全部旧列/文本/ID/确认/事件字节保留，FK和CHECK有效；未知拒绝，失败整批回滚；不改001/002 | 计划 |
| S5-21 R15 D07 | I | 停服库含各旧态及running/stopping | 取得单实例占用后启动恢复；另例占用冲突 | 仅确实遗留运行态failed+idle，无续跑；旧阵容恢复原规则；第二实例不能误伤第一实例 | 计划 |
| S5-22 R16 | S/E | GET游标k，控制订阅登记与提交时点 | 间隙提交、补发期间再提交、相同版本多事件 | 所有事件最终一次应用；事务批次不半应用；未订阅也照常运行，不漏快照间隙 | 计划 |
| S5-23 R16 | S/E | 部分批次后断线、旧after与新header | 重连、重复/跨场/旧/超前/缺失游标 | 正确header优先；非法400，不可恢复reset→GET；客户端按已应用游标重建，不丢批次中前项 | 计划 |
| S5-24 R15 R16 | S/E | 同场两观察者、两场事件同时推进 | 关闭一个观察者/切场，释放旧回调 | 其他观察继续；旧回调不污染新场；无模型副作用，无跨场数据/停止传播 | 计划 |
| S5-25 R16 | S/E | 慢客户端write=false、另正常连接 | 堆积至缓冲/10秒drain截止，终态再订阅 | 断开慢连接但runner继续；无无限内存；终态补发后end/close，已追平204；心跳无事件记录 | 计划 |
| S5-26 R08 R11 R12 R17 | E | 真前后端SQLite/SSE/Fake与长中文发言 | 开始、观察、结束、离线/联网、三视口滚动 | 正文和状态独立；断线不冒充failed；各区滚动/证据定位/总结提示，保留阵容流程 | 计划 |
| S5-27 R02 R03 R04 R22 | U/I/E | 原草稿与4C阵容场景、新运行DTO | 回归创建/列表/确认/生成轮询，运行解析 | 旧19/21字段保持，新24字段严格；不再全局断言eventId==version或confirmedAt==updatedAt | 计划 |
| S5-28 R09 R14 | U/I/S/E | Fake故障/隐藏字段/测试哨兵、显式拦截外网 | 全部公开出口和日志、普通入口/测试 | 不读取真实配置，真实网络调用0；无隐藏内容/内部事件/SQL/栈；stage-4d授权目录未读写 | 计划 |
| S5-29 R05 R06 R07 R10 R12 | Q | 未来单独真实讨论授权和预算 | 检查意愿相关性、响应依赖、引用支持、句子及总结 | 分别记录真实能力/质量及局限；不由Fake或4D阵容样本推断 | 计划 |

5B核心行为依真实失败→最小实现→通过→相关回归；只有行为未实现失败才是RED。5C浏览器按业务状态/版本/可见内容等待，屏障控制网络交错，不以固定sleep证明正确。每个测试独立关闭runner、Provider等待、SSE连接和SQLite；迁移/数据库故障只用临时夹具。传输重试可能重复，测试应用幂等，不宣称SSE恰好一次。
