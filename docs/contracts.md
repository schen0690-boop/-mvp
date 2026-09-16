# HTTP与SSE公开契约（当前阶段5C）

当前：草稿、阵容、5B运行/停止及5C SSE均已实现。各阶段小节保留历史背景；当前运行字段及SSE以本文末节为准，阵容沿用[lineup-design.md](lineup-design.md)。所有正文UTF-8，JSON是API传输格式，不直接作为页面文本。

阶段2/3小节保留其历史背景；下方“阶段4B阵容HTTP增量”覆盖新状态、版本、错误和前端解析。确认与开始严格分离，本轮不新增运行接口。

阶段5A设计经P11确认并在5B/5C实施；末节覆盖上文早期stop/SSE/发言类型草案中的冲突，早期未实现措辞仅反映当时状态。4D单样本阵容结果见stage-4d-validation，原真实调用授权已关闭。

## 标识、版本与公开类型

| 字段/类型 | 定义 |
|---|---|
| discussionId、roleId、utteranceId、findingId | 服务端生成的不透明 UUID；查询及引用必须验证归属，UUID 本身不提供授权 |
| status | created / generating_lineup / awaiting_confirmation / lineup_generation_failed / lineup_confirmed；running / stopping / completed / failed属于未来运行阶段 |
| version / dataVersion | 同一场公开数据版本：快照字段为 version，事件字段为 dataVersion；每次原子变更加1，不保证与事件数相同 |
| eventId / lastEventId | 同一场持久化公开事件正整数序号；初始快照无事件时 lastEventId=0；不同场编号可重复 |
| transcriptVersion / seq | 公开普通发言的版本/序号；初始0，每条发言加1，Summary 不计入 |
| lineupRevision | 最后成功阵容的generationVersion；初始0，可跳号；可整套重新生成，不支持编辑/换人 |
| confirmedLineupRevision | 尚未确认时为 null，成功/lineup/confirm后固定为当前版本，不自动start |
| sourceTranscriptVersion | 综合/总结依据的 transcript 版本，由后端请求上下文设置 |
| LineupMember（roles元素） | memberId、role(moderator/expert)、name、profession、title、stance、color、displayOrder；不含未来运行字段 |
| Utterance | id、discussionId、roleId、seq、sentences(1–2项)、replyToUtteranceIds、createdAt |
| Finding | id、kind(consensus/disagreement)、text、evidenceUtteranceIds(至少1项) |
| Synthesis | sourceTranscriptVersion、items(Finding数组)、updatedAt；初始null |
| Summary | status(ready/unavailable)、text(string或null)、sourceTranscriptVersion；初始null |
| PublicNotice | code、message(安全中文)、retryable、action(try_again/new_discussion/none) |
| PublicSnapshot | discussionId、topic、expertCount、status、version、lineupRevision、confirmedLineupRevision、transcriptVersion、lastEventId、roles、utterances、synthesis、summary、lastNotice、stopReason、createdAt、updatedAt、startedAt、endedAt |

时间为 ISO 8601 UTC，未发生的 startedAt/endedAt 为 null。数组初始为空。stopReason 初始 null；允许 user_requested、turn_limit、duration_limit、no_participation、synthesis_unavailable。failed 的原因由安全 notice 表达，不使用 stopReason 伪装正常结束。

PublicSnapshot 是明确字段白名单，不能直接展开数据库行。内部 runEpoch、意愿及评分、模型原响应、隐藏推理、API 地址/密钥、调用栈、原始诊断均不存在于公开类型中。

## HTTP 操作

成功时 `Content-Type: application/json`。写操作接受 JSON 对象，拒绝未声明字段。表中的“快照”均为一致事务读出的 PublicSnapshot。

| 方法/路径 | 目的与输入 | 成功输出 | 状态、重复与错误 |
|---|---|---|---|
| GET /api/discussions | 首页列表；query：status=active或all（默认active） | 200：items 数组，每项 discussionId/topic/expertCount/status/version/updatedAt；active 包含 generating_lineup/awaiting_confirmation/running/stopping；updatedAt降序、同时间discussionId升序（阶段2补充的C类排序规则） | 400 无效过滤条件；列表读取不创建/启动任务。MVP 全量列表，分页待需要时设计 |
| POST /api/discussions | 创建草稿；body：topic、expertCount、requestId(客户端UUID) | 首次201；重复同输入200；body：discussionId、snapshot、replayed | topic去首尾空白后1–500字符；expertCount省略时服务端默认4，显式值须为整数1–8且另加主持人；null/字符串/布尔/小数/越界拒绝；requestId唯一，重复且输入不同409 IDEMPOTENCY_CONFLICT；不自动调用模型 |
| GET /api/discussions/{discussionId} | 阵容、观察、结束记录的初始/重置快照 | 200快照；Cache-Control: no-store | 404不存在；无启动、确认、模型调用等副作用 |
| POST /api/discussions/{discussionId}/stop | 提前结束运行；空JSON对象 | running首次202快照；stopping为202；completed/failed为200 | 每个讨论最多安排一次终结总结；重复请求不增加runEpoch、不重复总结。created/generating_lineup/awaiting_confirmation返回409 INVALID_STATE，不将离开确认页等同停止 |
| GET /api/discussions/{discussionId}/events | 订阅本场公开事件；query after=非负整数；自动重连可带Last-Event-ID | 200 text/event-stream；具体见下 | 404不存在；400无效游标/UUID/跨讨论游标。断线与重新订阅都不启动/停止讨论 |

阶段4A新增生成/确认的契约见末节；confirm与start分离，只确认不启动。未来开始接口需在后续运行设计明确，不把旧/start合并行为继续当作有效阵容契约。旧stop/events尚未实现，本轮没有设计增量。

202只代表受理，HTTP断开不撤销已提交生成；GET查询不触发任务。阵容命令幂等不同于创建幂等，详见末节。

## 运行时校验

共享 TypeScript 类型仅用于编译期；服务端在 JSON 解析后必须运行真实 schema 校验，并执行数据库关联验证。阶段2使用小型手写运行时校验与字段白名单，不新增schema框架；未来模型输出仍必须真实校验，不能用 `as Type` 代替。

| 边界 | 校验规则（长度均为Unicode码点，数字为C建议） |
|---|---|
| HTTP | 限JSON正文16KiB；拒绝null/数组充当对象；UUID格式、整数范围、枚举、未知字段、空白topic；expertCount不可是字符串/小数/NaN；持久化规范化topic |
| 阵容输出 | 对象只含roles，每项role/name/profession/title/stance；1 moderator+N expert；名称1–64、profession/title各1–80、stance1–200码点；trim后非空、规范化姓名判重；memberId/颜色/displayOrder/版本/时间由系统生成。详细管线与分类见lineup-design第5节 |
| 意愿输出 | wantsToSpeak布尔；intent仅answer/supplement/rebuttal/question；replyToUtteranceIds为本场已存在ID数组；publicFocus为null或1–80字符的独立公开关注点；不接受reasoning/score/debug等额外字段 |
| 普通发言输出 | sentences恰好1–2个非空纯文本字符串，每项建议至多160字符；replyToUtteranceIds只引用本场请求快照中已有发言；后端设置roleId/seq/版本。拒绝明显序列化对象/数组或HTML作为“公开句子”，不执行HTML；句界除数组约束外做中文终止标点检查，缩写/引文边界列入人工质量检查 |
| 共识/分歧输出 | items建议至多12；kind合法、text 1–300字符、evidenceUtteranceIds非空且全部属于本场请求快照；服务端生成findingId和sourceTranscriptVersion。分歧验证不同角色证据，空items合法且不虚构共识 |
| 总结输出 | 只含text，1–2句、建议至多320字符的自然语言，使用与普通发言一致的句界校验原则；拒绝JSON对象/数组原文、隐藏推理字段或诊断文本；总结单独展示，不写入Utterance |
| 提交结果 | 当前discussionId、status、runEpoch、源transcriptVersion必须满足该任务的提交条件；不匹配即丢弃，不能让重试结果越过stop或新版本 |

模型供应商可能用JSON文本封装对象，适配器可以解析一次指定内容字段再校验；解析失败走有限重试，不能靠“找第一个大括号”猜取或把原文转成发言。供应商 envelope 的推理/诊断字段在适配器边界丢弃；模型正文里出现未知字段则校验失败。输入topic及transcript按不可信数据区块传入，不覆盖系统职责。

纯文本显示使用框架转义，不使用 dangerouslySetInnerHTML；禁止以“调试模式”把原始输出展示给用户。公开关注点由专门字段生成和筛选，不从隐藏推理或内部评分重写而来。schema不能完全证明文本语义安全，仍需T13恶意输出样例与T18人工检查。

## SSE 公开事件

以下是早期未来SSE设计，尚未实现；阶段4A不新增SSE，阵容状态变更仅按lineup-design第7节复用已存储的discussion.status_changed。表中的lineup.ready不在4B产生，未来实现SSE时再统一消费者契约，不能把此表当作4B需要新增推送的授权。

持久化事件统一载荷：discussionId、eventId、dataVersion、type、occurredAt、payload。SSE 的 `event` 行使用下表 type；`id` 行为 `discussionId:eventId`，`data` 行是上述公开对象。每个事件最多只归属一场讨论。

| type | payload必要字段 | 含义 |
|---|---|---|
| discussion.status_changed | status、stopReason、startedAt、endedAt、confirmedLineupRevision、summary | 已持久化的生命周期变化；未有总结时summary=null，结束失败总结为unavailable，保证纯SSE观察者也能得到终态 |
| lineup.ready | lineupRevision、roles | 有效阵容可供确认 |
| role.status_changed | roleId、status、publicFocus | 真实任务阶段的投影，不包含意愿、打分或隐藏思考 |
| utterance.created | utterance | 一条已校验、已持久化的普通公开发言 |
| synthesis.updated | synthesis | 原子替换当前综合；sourceTranscriptVersion决定适用内容 |
| summary.ready | summary | status=ready的自然语言总结 |
| discussion.notice | notice | 安全中文提示；失败总结通过notice及终态快照表达 |

一条原子事务可包含 role.status_changed 和 utterance.created 等多条事件；同dataVersion不能视为重复，必须按eventId区分。每次公开变更更新Discussion.updatedAt，事件occurredAt使用该事务的updatedAt，客户端据此更新快照时间。utterance.created将transcriptVersion推进至utterance.seq；lineup.ready更新阵容和lineupRevision；discussion.notice更新lastNotice；状态事件包含确认版本和总结，保证持续观察者不必靠猜测补字段。summary.ready之后的completed事件与快照反映最终状态；unavailable总结不伪造summary.ready。事件载荷只含相关公开对象，客户端不可将整个data对象直接打印到界面。

### 快照与后续事件衔接

1. 客户端先GET快照，以其中lastEventId=k初始化游标，并替换该场本地状态。
2. 再连接 `/events?after=k`。服务端从数据库补发eventId>k的事件；快照取得后、连接建立前的事件也在库中，因此不丢失。
3. 服务端先登记该观察连接的实时通知，再读取事件高水位并按序补发；随后对缓冲通知再按游标从数据库读取。通知仅唤醒读库，数据库是事实来源，去重后交付严格递增事件。不得采用“先读完，再监听”的丢事件窗口。
4. 快照包含的数据和lastEventId来自同一读事务。客户端仅在应用完整事件后推进游标；同场eventId≤已应用游标忽略，跨场一律拒收。
5. SSE心跳使用注释行，无eventId、无业务状态含义。允许断开后自动重连，但不能用心跳假扮专家活动。

### 重连、旧事件与缺口

- 首次使用after；原生EventSource重连的有效 `Last-Event-ID` 优先于URL旧after，二者不同是正常情况。header中的discussionId必须等于路径，eventId必须为非负安全整数。
- 断线不清空已有内容；显示“连接中断，正在重连”，禁用依赖最新状态的开始按钮。恢复后按游标补发，重复事件忽略。
- eventId连续但dataVersion相同的事件逐条应用；dataVersion小于当前已应用版本的旧载荷不覆盖新状态，但游标仍推进。综合还必须检查sourceTranscriptVersion不得小于已应用综合版本；不以时间戳决定新旧。
- 收到eventId>本地游标+1的缺口、游标超出服务端末尾、历史补发不可用时，服务端发送一次连接控制事件 `stream.reset`（无id，仅reason与固定快照路径），然后关闭。客户端关闭旧EventSource、重新GET快照、用新after建立新连接，避免旧Last-Event-ID循环。
- stream.reset是连接控制信息，不进入PublicEvent表、不呈现在Transcript。当前C建议保留全部事件、不自动清理；该降级仍覆盖数据恢复/版本变更造成的补发不可用，不构建通用事件保留平台。
- 初始快照替换时必须关闭旧连接并使旧回调失效；迟到的旧连接消息不能写入新讨论或新快照。

## 用户错误与内部诊断

HTTP错误体只含 error：code、message、retryable、action、requestId。requestId为无敏感数据的关联标识，不包含输入正文。HTTP层解析/校验失败通常400，未知讨论404，状态/版本/幂等冲突409，容量不足429，存储或内部异常500；已受理的模型失败通过状态/notice报告，不追写已完成的HTTP响应。

示例安全错误码：INVALID_INPUT、NOT_FOUND、LINEUP_NOT_READY、STALE_LINEUP、INVALID_STATE、IDEMPOTENCY_CONFLICT、CAPACITY_REACHED、MODEL_TIMEOUT、MODEL_INVALID_OUTPUT、MODEL_UNAVAILABLE、RUN_INTERRUPTED、INTERNAL_ERROR。用户文案如“阵容生成失败，请重试”，不携带供应商URL、响应正文、认证信息或堆栈。

内部诊断可记录独立traceId、discussionId、taskKind、耗时、错误分类、尝试次数；不得记录密钥、隐藏推理或模型原始响应。前端只显示error.message和安全操作建议；详细诊断不走HTTP/SSE公开路径。

本地MVP无账户系统；服务仅绑定loopback，前端通过同源代理/固定允许来源访问。对写请求验证Origin/Content-Type并限制正文，不能因为“本地”就允许任意跨站写操作；不提供用户可控模型地址以避免SSRF扩展面。这些约束是C类本地运行设计，不宣称提供多用户权限隔离。


## 阶段2已实现契约补充

- 创建是第一个公开原子变更：status=created，version=1、lastEventId=1；lineupRevision/transcriptVersion=0，confirmedLineupRevision=null，roles/utterances=[]，synthesis/summary/lastNotice/stopReason/startedAt/endedAt=null。createdAt=updatedAt，均由服务端生成UTC ISO 8601毫秒时间。
- 首条discussion.status_changed事件eventId/dataVersion=1，与草稿同事务。事件只写库，未提供SSE或事件读取HTTP接口。
- 创建requestId必须是UUID（RFC格式、版本1–8及标准variant），接受大小写但规范化为小写。讨论ID由服务端UUIDv4生成。幂等比较去首尾空白后的topic及补全默认值后的expertCount；相同requestId不同规范化输入409。
- 列表未知query字段、重复status或不在active/all内的值返回400；没有分页和搜索。默认active不含created，因此当前仅有草稿时默认列表为空。
- 400包括JSON格式/对象形状错误、未知字段、人数/话题/UUID非法、超过16KiB、Content-Type错误、Origin不允许及不支持的正文编码。所有错误沿用error五字段；400/404/409为retryable=false、action=none；500为retryable=true、action=try_again。错误关联requestId由服务端另行生成，与创建幂等键职责不同。
- 写操作仅application/json；无Origin的本地客户端允许；带Origin只允许HTTP同源loopback，未启用跨域访问。公开响应均no-store。未实现路径返回安全404。
- 话题1–500码点规则由运行时执行；SQLite仅做1–2000字节的存储保护，避免其文本length在U+0000处停止造成与业务规则不一致。正文不是页面渲染，后续UI仍须文本转义。

## 阶段3浏览器消费者约定（历史基线；4B解码扩展见末节）

- 前端topic按trim后Unicode码点1–500校验，不使用UTF-16 maxlength；人数选择1–8，默认4，不含主持人。未知响应字段/缺字段、非草稿状态、不一致ID/人数/话题均拒绝显示；当前客户端只接受阶段2草稿DTO，扩展生命周期时须同步更新校验。
- 每次逻辑提交使用crypto.randomUUID；忙碌时表单禁用并同步防重入；失败重试保持不可变正文/ID；编辑输入或成功后明确再次创建生成新ID。201首次和200重放都显示同一服务端快照；409显示冲突并保留原ID，不静默轮换。
- 创建成功后切换all并加载列表、选中新建详情。active仍按后端过滤且不含created。GET无创建副作用。列表失败可独立重载，已保存快照不丢失。
- 请求10秒超时是前端C类等待边界，不等同未来模型超时；超时不能证明后端未提交。尚未确认的创建信息仅存在内存，刷新后须先查列表而非自动重发。
- 列表和详情各有本地查询代次，防旧响应及finally覆盖；该代次不是服务端version或eventId，不写入API。
- 本轮浏览器采用固定安全中文文案映射HTTP错误状态；不信任或直接渲染响应error.message、HTML或原始JSON。成功正文需运行时校验，话题通过React文本节点显示。本地时间显示只转换格式，API仍使用UTC ISO毫秒。

## 阶段4B阵容HTTP增量（P6已确认并实现）

详细领域和事务条件见[lineup-design.md](lineup-design.md)。不改变已有创建/单条/列表路径；新增两个写操作，不新增任务查询或发言API。写操作统一应用JSON对象、16KiB、拒绝未知字段、同源loopback Origin保护；这些保护已覆盖创建和两个阵容POST路由。

### 请求与返回

| 方法/路径 | 精确body | 成功响应 | 状态与重复 |
|---|---|---|---|
| POST /api/discussions/{discussionId}/lineup | requestId: UUID；expectedGenerationId: UUID或null，两键必填 | 首次受理202：{discussionId,generationId,generationVersion,snapshot,replayed:false} | created使用null；失败重试/ready重新生成使用当前generationId。新代次只在CAS和状态校验通过时受理；原topic/count从DB读取 |
| 同一/lineup请求重放 | 相同requestId和expectedGenerationId | 仍在生成202；ready/生成失败200；同样五字段，replayed:true、snapshot为当前持久化快照 | 不增加代次/版本/事件，不再调用Provider；生成失败后若要真正重试，必须新ID+当前generationId |
| POST /api/discussions/{discussionId}/lineup/confirm | generationId: UUID；lineupRevision: 正安全整数，两键必填 | 首次及相同版本重放均200：{discussionId,snapshot,replayed} | 只从awaiting_confirmation确认当前双版本，进入lineup_confirmed；重复确认同版本replayed:true，不更新时间或启动任务 |
| GET /api/discussions/{discussionId} | 无body | 200：扩展的公开snapshot | 从一致读事务读取讨论+成员，刷新不调Provider、不修复状态 |
| GET /api/discussions?status=active或all | 无body | 200：原六字段items | 保留原active集合和排序；lineup_generation_failed/lineup_confirmed仅在all，全部状态使用准确文案 |

generationId与requestId均为UUID：前者服务端UUIDv4，后者客户端UUID，输入校验沿用现有UUID规则及小写规范化。expectedGenerationId只用于并发比较，不等于客户端决定新ID。新生成成功返回的generationVersion由系统分配，从1递增。服务端在事务提交前预留本进程调用槽，CAS失败/回滚则释放；无槽429且不写业务数据。不承诺网络层“恰好一次”，只承诺这些幂等和CAS范围。

建议请求示例（占位UUID仅说明，不能固定复用创建不同操作）：首次生成body为requestId+expectedGenerationId:null；确认时取GET当前lineupGeneration.generationId和lineupRevision；重新生成另取新requestId+当前generationId。生成接口同时承担重试和整套重新生成，不增设同义/regenerate。

### 快照兼容与不变量

- **status=created**：保留阶段3严格19字段及初始值，省略新键；已迁移旧草稿通过同一路径读取仍是该形态。
- **其他四个阵容状态**：保留原19键，新增lineupGeneration和confirmedAt两个键。lineupGeneration精确为{generationId,generationVersion,startedAt,finishedAt}，映射current_generation_id/generation_version/generation_started_at/generation_finished_at；startedAt非null，finishedAt生成中null、其余非null。此处nested startedAt是生成时间，外层startedAt仍为null（讨论未运行）。
- lineupRevision映射lineup_revision；confirmedLineupRevision映射confirmed_lineup_revision；confirmedAt映射confirmed_at，仅lineup_confirmed非null。roles仅ready/confirmed返回LineupMember八公开字段，按displayOrder排序；生成中/失败返回[]，即使DB保留上版也不投影。ready/confirmed时lineupRevision=lineupGeneration.generationVersion；生成/失败时保留最后成功revision；当前可达状态中严格小于新generationVersion。
- transcriptVersion=0，utterances=[]，synthesis/summary/stopReason/外层startedAt/endedAt均null。lastNotice仅失败时由固定错误码映射{code,message,retryable,action}，其他状态null。version/lastEventId不再限定1，均正安全整数；createdAt不变，updatedAt由实际公开事务推进。
- 不公开generation_request_id/generation_base_id、旧隐藏成员、name_key、Provider内容、attempt计数、异常栈、库路径。成员只有memberId/role/name/profession/title/stance/color/displayOrder；没有id/kind别名或虚构运行状态。
- 创建同requestId重放时仍返回当前discussion快照，讨论可能已进入阵容状态；新版创建响应解码必须允许该联合类型，不能强断言created。新建草稿的首次201仍严格created。讨论topic/count不可被阵容命令改变。

### 错误优先级与公开边界

先校验请求形状/UUID/整数（400 INVALID_INPUT），再定位讨论（404 NOT_FOUND）。已确认或未来运行终态先409 INVALID_STATE，避免旧生成ID绕过锁定。对生成中/ready/失败：先匹配当前requestId，基代次不同409 IDEMPOTENCY_CONFLICT；同键同输入按表重放；否则基代次不匹配409 STALE_GENERATION，匹配但正在生成409 GENERATION_IN_PROGRESS。created正常路径仅允许expectedGenerationId=null。

确认在created/generating/生成失败时409 LINEUP_NOT_READY；ready/confirmed双版本不匹配409 STALE_LINEUP；ready匹配则原子确认；confirmed匹配200重放；未来运行状态409 INVALID_STATE。旧确认绝不确认用户未看过的新阵容。

请求合法但没有调用槽429 CAPACITY_REACHED（true/try_again）；受理前已识别存储故障503 STORAGE_UNAVAILABLE（true/try_again）；未知内部异常500 INTERNAL_ERROR（true/try_again）。400/404/409仍false/none。均沿用error.code/message/retryable/action/requestId五字段，关联requestId是服务端错误追踪UUID，不是幂等键。

Provider超时、传输/结构/业务错误发生在202之后：不补写HTTP错误、不统一500，而是落为lineup_generation_failed，GET200带安全notice。已知永久配置失败用LINEUP_PROVIDER_CONFIGURATION（retryable=false/action=none）；暂时不可用用LINEUP_PROVIDER_UNAVAILABLE（true/try_again）；其他LINEUP_TIMEOUT/LINEUP_INVALID_STRUCTURE/LINEUP_INVALID_MEMBERS/LINEUP_STORAGE_FAILED/LINEUP_INTERRUPTED均true/try_again。客户端按允许的code映射文案，不显示任意error.message或Provider正文。

同时无法保存结果与失败状态时，事务回滚并由内存标记当前讨论不可用，相关请求503；既有持久化generating状态由下一次启动恢复，不在GET内写库或虚构failed。该故障需要处理本地存储问题；重复GET不会修复磁盘。迟到结果仅内部分类STALE_GENERATION_RESULT，无公开事件/notice。原有created错误契约保持不变。

### 4B可运行示例与实际边界

首次生成：POST `/api/discussions/{discussionId}/lineup`，body `{"requestId":"新UUID","expectedGenerationId":null}`。202正文恰好五字段：discussionId、generationId、generationVersion、snapshot、replayed。即使Fake快速成功，受理响应仍是当时生成中快照，随后GET取得实际当前状态。

确认：POST `/api/discussions/{discussionId}/lineup/confirm`，body `{"generationId":"GET当前UUID","lineupRevision":1}`；用GET中的实际revision替代示例1。200含discussionId、snapshot、replayed；snapshot.status=lineup_confirmed，外层startedAt仍null。失败重试/重新生成复用/lineup路径，但必须新requestId及当前expectedGenerationId。占位字符串不能作为真实请求ID。

当前Provider仅Fake。默认演示成功，不提供浏览器选择异常模式的接口。失败模式只能由测试注入Provider；不开放调试接口。可执行全链路示例：`node scripts/http-smoke.mjs --lineup`（先build，独立新库与进程）。公开事件已落库但没有SSE或事件读取HTTP。

## 阶段4C浏览器消费约定（P7实现）

不新增或放宽4B后端接口/DTO。web/src/api.ts增加generate/confirm，发送精确命令，严格校验成功正文、讨论/代次/版本关联及replayed/状态码。ApiError只保留HTTP状态和本地安全文案，不渲染错误响应正文。

- created生成base=null；ready重新生成、failed重试使用当前generationId与新requestId。结果不确定重试沿用同一次请求；GET证明新代已受理后释放旧命令身份，真正失败重试必须新ID。
- confirm冻结当前双版本；409另GET（错误正文无snapshot），明确提示变化，不自动重提。GET失败保留文本但锁住已知过时的操作，手动检查成功后恢复；非409确认失败保留卡片和固定中文错误，可重试。
- 2秒串行GET，页面监测窗口最多60次自动查询；离线不计时补发，联网恢复计入剩余预算。终态/切换/卸载停止，隐藏详情暂停。上限只停止自动查询，不改业务status，允许显式手动GET；刷新/重新选择开启新页面窗口。
- URL仅含discussion定位ID，GET恢复所有状态；无localStorage阵容缓存。每个详情选择代次与查询代次隔离迟到结果；同讨论拒绝较低snapshot.version回退。多Tab各自读取，通过409/下一次GET接受当前状态，无额外同步协议。

## 阶段4D内部Provider边界（公开API不变）

DeepSeekRosterProvider以注入fetch发送固定官方HTTPS Chat Completions；model=deepseek-flash、thinking.disabled、stream=false、json_object、max_tokens4096，不传tools/extra_body/reasoning_effort。外层只提取有效stop的assistant.content；已有parseRoster/业务校验、系统赋值与事务保存不变。reasoning_content不读作正文、不存日志/事件。

内部RosterContext可携带generationId；服务重试前复核当前代次，ProviderError增加cancelled/filtered及retryable。400/401/402/422等配置错误和过滤/明确中止不自动重试；暂时传输、超时和无效结构仍共享至多2次。取消原因区分单次timeout与用户shutdown，30秒完整响应/60秒总期限不变。公开NoticeCode及错误结构没有扩展；过滤映射安全UNAVAILABLE、取消映射INTERRUPTED。

真实验收在固定持久化授权目录绑定一组discussion/generation，仅指定话题4专家；出站前预约累计2次，成功或终结后关闭。不把验收计数变成公开字段或通用计费平台。原Fake入口及常规测试不加载私有配置。

## 阶段5A设计、5B运行与5C SSE实际契约

领域接受条件、预算和迁移以[discussion-runtime-design.md](discussion-runtime-design.md)为唯一设计依据。P11授权的HTTP命令、24字段运行快照及事件持久化见[5B验证](stage-5b-validation.md)；P12授权的SSE envelope、订阅/补发/重连/背压及前端消费见[5C验证](stage-5c-validation.md)。不授权真实调用。旧阵容19/21字段保持，运行联合分支及事件未知字段仍严格拒绝。

### HTTP命令与重复语义

共同规则：同源loopback、application/json、正文≤16KiB、精确键白名单；格式/类型/UUID/整数先400，讨论不存在404，再检查命令幂等/状态/版本。所有错误沿用error五字段；400/404/409=false/none，429/503/500=true/try_again。运行中Provider失败通过已持久化snapshot/事件，不回写已结束的202。

| 路径 | 精确输入 | 返回与规则 |
|---|---|---|
| POST /api/discussions/{id}/start | {requestId:UUID,generationId:UUID,lineupRevision:正安全整数} | 首次lineup_confirmed且当前确认三项一致时202：{discussionId,runId,snapshot,replayed:false}。服务端生成runId，不接收客户端runId或并发/预算设置 |
| 同一/start重放 | 相同requestId且相同generationId/revision | 200同四字段、replayed:true，快照为当前持久化状态；即使已completed/failed也不重启。原绑定长期留在该讨论，不建通用幂等平台 |
| 双Tab不同requestId | running/stopping且相同已绑定阵容 | 200现有runId/snapshot、replayed:true；不认定第二次启动，不创建新任务/事件；不替换原start_request_id |
| POST /api/discussions/{id}/stop | 空对象{} | 首次running→stopping返回202完整snapshot；重复stopping返回202、completed/failed返回200当前snapshot；不重复总结。沿用旧stop响应形状，不另加requestId要求 |
| GET /api/discussions/{id} | 无body | 200一致snapshot，全部公开对象和lastEventId来自同一读事务；无修复/启动副作用 |
| GET /api/discussions?status=active或all | 沿用 | 原六字段列表和排序。active仍为generating_lineup/awaiting_confirmation/running/stopping；lineup_confirmed和终态只在all；前端不得只允许两个旧active状态 |

start顺序：已有相同start_request_id但绑定不一致→409 IDEMPOTENCY_CONFLICT；同键同绑定→只读重放。其他requestId遇completed/failed→409 INVALID_STATE；未确认→409 LINEUP_NOT_READY；当前/确认阵容双版本不匹配→409 STALE_LINEUP；running/stopping同绑定→已有运行；lineup_confirmed且绑定正确才申请运行槽。满2场429 CAPACITY_REACHED，无状态变更。已识别存储故障503 STORAGE_UNAVAILABLE，未知错误500 INTERNAL_ERROR。

stop在五种尚未运行状态全部409 INVALID_STATE（包括lineup_confirmed和lineup_generation_failed）。因为每场仅一次运行，空body不会误停“后来重新开播”的任务；若未来支持重开，必须另改此契约。HTTP断线不撤销已提交start/stop；客户端先GET核对，再明确重试原操作，不自动新建requestId。

### 运行快照及对象

running/stopping/completed/failed分支保留原21键（含lineupGeneration、confirmedAt）并新增**runtime、roleStates、synthesisState**，共24键。created仍19键，其他阵容状态仍21键。无运行时不额外插入三项null字段。既有创建幂等重放可返回这类当前运行快照，列表和GET也须同步支持。

| 对象/字段 | 定义 |
|---|---|
| runtime | {runId,runDeadlineAt,stoppingAt,stopDeadlineAt}；后两项未收尾时null，开始时runDeadlineAt非null；无内部epoch/task/调用计数 |
| startedAt/endedAt | 外层为运行开始/终结UTC毫秒，running/stopping的endedAt=null；lineupGeneration的时间仍是旧阵容生成时间 |
| roles、lineupGeneration、confirmedAt/Revision | 保持已确认阵容身份与八字段成员不变；运行后confirmedAt≤updatedAt，不再相等 |
| roleStates | 按成员displayOrder排序的N+1项，每项{roleId,status,publicFocus,focusSourceTranscriptVersion,updatedAt}；roleId就是roles.memberId；三态idle/preparing/speaking；无focus时两项null，focus版本≤transcriptVersion |
| Utterance（utterances元素） | {id,discussionId,roleId,seq,sentences,replyToUtteranceIds,createdAt}；id为utteranceId概念的实际字段名；seq按本场从1连续，sentences1–2项，引用同场更小seq，角色必须属当前已确认组 |
| Synthesis | null或{sourceTranscriptVersion,items,updatedAt}；items可空；每项{id,kind,text,evidenceUtteranceIds,positions}；positions为共识[]或分歧两项{text,evidenceUtteranceIds}，约束见核心规格第8节 |
| synthesisState | idle/preparing/ready/failed；开始idle；任务开始preparing；成功（含空items）ready；有限失败failed，可保留旧synthesis；来源滞后由sourceTranscriptVersion比较显示 |
| Summary | null或{status:ready或unavailable,text:string或null,sourceTranscriptVersion}；ready对应合法自然语言，unavailable必须text=null；已完成必须非null；Summary不进utterances |
| stopReason | 既有user_requested/turn_limit/duration_limit/no_participation/synthesis_unavailable，新增call_budget_exhausted；未进入stopping时null；failed原因仍看notice，不虚构正常原因 |
| version / lastEventId | 独立安全正整数。公开事务version+1，多事件共享该版本且lastEventId按事件数推进；不得要求两者相等 |

运行notice沿用{code,message,retryable,action}，固定中文映射：RUN_START_FAILED/RUN_INTERRUPTED/HOST_UNAVAILABLE/DISCUSSION_PARTICIPATION_UNAVAILABLE/DISCUSSION_PROVIDER_CONFIGURATION/CONTEXT_LIMIT/RUNTIME_STORAGE_FAILED均false/new_discussion（配置、存储原因另需维护）；SYNTHESIS_UNAVAILABLE为false/none并注明保留旧观点；SUMMARY_UNAVAILABLE、SUMMARY_NO_CONTENT为false/none。不得给终态提供“重试本场模型”动作；前端不渲染原始诊断message。临时单专家失败只将其状态回idle，整场仍可继续。

### 公开事件与事务批次

现有表主键(discussion_id,event_id)，不是全局编号；创建event1，4B每次last_event_id+1，回滚不占号。003继续**讨论内连续**分配全部公开事件，不按类型过滤订阅；该条件成立时才将eventId跳号视为缺口，不以dataVersion+1或全局rowid检查。

SSE持久化消息envelope为{discussionId,eventId,dataVersion,type,occurredAt,payload,transactionLastEventId}。最后一个字段由同discussion/dataVersion的最大event_id读出，不改旧payload、不重复存库；旧单事件事务就是自身eventId。SSE id=`discussionId:eventId`，event=type，data为该白名单JSON。客户端不得把JSON直接渲染。

| type | 精确payload及应用语义 |
|---|---|
| discussion.status_changed | 历史创建六键及4B十一键按原形状识别；新运行载荷保留4B十一键并加runtime/roleStates/synthesisState。十一键为status/stopReason/startedAt/endedAt/confirmedLineupRevision/summary/lineupRevision/lineupGeneration/confirmedAt/roles/lastNotice。开始时初始化运行三字段；后续状态覆盖对应字段。发言/综合数组分别由自身事件更新，不重发整场transcript |
| role.status_changed | {roleId,status,publicFocus,focusSourceTranscriptVersion}；updatedAt取occurredAt，仅更新对应roleStates。意愿/候选/竞争不在其中 |
| utterance.created | {utterance}；追加唯一id/seq并令transcriptVersion=seq，不能重复显示 |
| synthesis.status_changed | {state}；更新synthesisState，失败不清除旧synthesis，不把失败当新共识 |
| synthesis.updated | {synthesis}；整组替换并设置synthesisState=ready；source版本不得倒退 |
| summary.ready | {summary}且status=ready；与completed状态同一事务批次；unavailable不发这个事件 |
| discussion.notice | {notice}；只更新受控lastNotice |

不新增lineup.ready，不将内部请求、Abort、意愿或heartbeat存进这些类型。运行状态事件里summary不可用时也携带lastNotice；仅使用SSE的观察者也能得到完整终态，GET仍可独立取得同一终态。每个事件occurredAt=该事务updatedAt，接收时相应推进本地updatedAt。单事件序列化上限64KiB（C）；超限必须在数据库提交前拒绝，不能提交了才丢弃推送。

客户端以eventId去重而不是dataVersion。将同dataVersion的事件应用到临时副本，到transactionLastEventId齐全才原子更新公开快照/version/lastEventId；断线丢弃未完成批次，重连从最后**已应用**游标补发。这样不会在“发言提交与角色状态/收尾同事务”中途画出互相矛盾的状态。

### 初始快照、订阅、重连与终止

1. GET一致快照，记k=lastEventId；首次连接GET `/api/discussions/{id}/events?after=k`。先注册按discussion的提交通知，再读高水位H，按eventId递增补发(k,H]，继续读通知后的新高水位。通知只设dirty标记，事件内容取数据库，补发中不持有长期事务；不得先补发完才注册监听。
2. after为非负安全整数十进制（缺省0），拒绝重复/未知query。有效Last-Event-ID=`同discussionId:非负安全整数`优先于URL旧after；非法/跨场header直接400而非退回after。不存在讨论404，已识别存储不可用503；不返回诊断。
3. 补发包含快照后订阅前的事件；前端只接受当前页面选择token/当前discussion，eventId≤已应用k直接忽略。更高ID但dataVersion倒退、未知类型/字段、批次不一致、序号缺口均不应用，关闭并重新GET。snapshot替换必须关闭旧EventSource和失效旧回调，避免旧连接污染新场。
4. 请求游标超出末尾、历史缺失、游标落在事务批次中间时，返回200 SSE发送`stream.reset`控制消息（**无id、不写库**）：{reason:cursor_ahead/history_unavailable/partial_transaction,snapshotPath:固定本场GET路径}，然后关闭；前端关闭旧实例、GET再连接。不能将reset塞进Transcript或当业务failed。
5. 原生EventSource的Last-Event-ID代表已接收，不保证应用已完成批次。5C前端在onerror主动close，保留最后已应用快照并丢弃半批；等待1/2/4/8/10秒后执行单个可取消GET，严格验证其不旧于已应用快照，再以新快照lastEventId创建EventSource。不依赖旧实例自动推进的header。5次自动恢复机会耗尽后显示手动重连；连接open本身不清零失败次数，有效业务批次才清零。服务端仍支持Last-Event-ID；partial_transaction触发快照恢复。所有恢复只读，不修改业务状态、不自动POST。
6. 通常SSE 200、Content-Type text/event-stream;charset=utf-8、Cache-Control:no-store；注释心跳约15秒、无id且不写业务表，不模拟专家状态。实际文本按完整短发言提交就推送，不收集整场后播放。供应商token流不是本阶段需求。
7. 补发完completed/failed的最后完整事务后发送无id的`stream.end` {discussionId,lastEventId}并结束；客户端看到终态批次立即close。已在终态且请求游标等于末尾时204，不进入自动重连循环；落后则先补发终态，超前先reset。lineup_confirmed不是运行终态，可只读订阅等待另一Tab开始。
8. 页面切换/卸载关闭连接、心跳与重连定时器，注销服务器监听和缓冲；不stop runner。多个观察者共享已存在runner，不复制上下文/任务。不同场的游标、连接、通知和取消域分别管理。

### 慢客户端

每连接最多64条待发事件且总字节≤256KiB（C，先达到者为限），数据库按最多32条分页读取，不拆分事务组（下一整组超出页上限则留到下一页；本版单事务事件数不得超过32）；无法放入下一批则暂停读库。response.write返回false后停止继续写，等drain，最长10秒；超限/超时断开该连接，不阻塞runner或其他观察者，不删除持久化事件。已背压时不保证能发送reset；前端从已应用游标重连/快照恢复。仅一个dirty标记合并通知，不创建无限事件副本。终态和断连都清理监听。

编号、应用幂等和有限缓冲是应用契约，SSE不是“恰好一次”。重连/204/Last-Event-ID依据5A已查阅的[WHATWG规范](https://html.spec.whatwg.org/multipage/server-sent-events.html)，write/drain依据[Node HTTP文档](https://nodejs.org/api/http.html#responsewritechunk-encoding-callback)；5C本地验证见报告，不代表生产负载验证。

### 5C补充边界

- 服务端允许订阅任意已有讨论状态，包含草稿、阵容态与运行态；所有订阅均无业务副作用。当前前端仅为lineup_confirmed和运行分支建立连接，completed/failed快照直接关闭；generating_lineup仍使用4C轮询。
- 数据源先注册数据库提交通知，再一致读库；通知只有唤醒作用，不包含业务载荷。当前单数据库单进程通知会唤醒其他讨论订阅，但每次读库严格按discussionId筛选，绝不跨场发送。外部进程写库不属于已支持的运行方式。
- 流额外设置X-Accel-Buffering:no，flushHeaders及时送出；Vite代理实时性已有真实浏览器链路验证。出流后异常仅安全reset/关闭，不能再写普通JSON错误。
- 同场手动GET加载保留已有内容，旧GET不能覆盖新版本；跨场切换使旧响应/回调失效。StrictMode清理后可重建，任何时刻只保留一个有效页面订阅。前端批次最多32事件/256KiB，超限执行有限快照恢复。
- 每次读库最多32条且不拆分事务；当前实现不叠加多个待读批次，write=false即停止读取。批次超过64条/256KiB连接限额即关闭；10秒未drain关闭；取消订阅不取消runner、不释放运行槽。15秒心跳仅注释且不写库。
## 阶段6A实现补充：供应商讨论边界

公开HTTP、snapshot和SSE契约不变。四能力输入/输出继续采用`DiscussionProvider`和`domain/discussion.ts`，DeepSeek只返回经过结构/业务校验的公开候选，由原runner核对run/epoch/transcriptVersion并事务提交。适配器不能选择发言者、写系统字段、改变终态或自行重试。

任务输出max_tokens分别为意愿512、发言768、提炼4096、总结1024；实际内容仍受既有1–2句/每句160码点/总结320码点/证据规则约束。每个消息的公开数据96KiB、user JSON128KiB、输出content16KiB、外层响应128KiB限额；长度超限明确失败，不截断最新发言或补造证据。这些字节/字符界限不是token计数或费用估计。

固定官方地址、deepseek-flash、thinking.disabled、stream=false、json_object、无tools，禁止重定向；完整响应及正文读取受原30秒/任务期限和取消信号约束。HTTP400/401/403等永久错误为configuration；408/429及可恢复5xx为transport；其他分类沿用timeout/cancelled/filtered和invalid_structure/invalid_content。恢复/修复仍共享runner两次尝试，无第三层调用。缺失usage为“未取得”，诊断只白名单operation/taskId/attempt/status/耗时/finish_reason/usage/outcome。

正常入口显式Fake；独立DISCUSSION_PROVIDER配置仅经明确组合入口注入，不从私有文件自动启用。deepseek缺配置/缺显式transport即失败，无Fake回退。本轮官方请求0，stub不放宽生产Base URL限制。见[验证与6B待授权方案](stage-6a-validation.md)。

## 6B受限验收补充（P14）

仅后端受控SqliteDiscussionStore acceptance绑定唯一discussion/run，可设2次专家成功提交/普通120000ms；客户端start字段不变，不能指定参数。runDeadlineAt从running提交时间计算，排队/重试计入；总结仍60000ms且独立取消。第二次专家提交原子进入stopping，不再提炼；首次专家后仍由原runner提炼一次。正常12/600000及003的B(N)不改。前端快照运行期限严格接受600000或此次120000，其他不接受。

独立固定授权目录不可变slot限制20=普通18+唯一总结2，在唯一传输之前持久化。普通预算不足抛CallBudgetError由runner转已有预算收尾，不额外重试；已预约未知结果不退还。公开快照中的callLimit为程序技术上限，不代表真实授权金额/次数；实际请求授权查看6B验证记录。无新增HTTP业务字段、schema或SSE事件。授权记录含代码版本/绑定/固定参数，重启只中断恢复而不续跑，终态后关闭。
