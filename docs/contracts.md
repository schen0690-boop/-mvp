# HTTP 已实现契约与后续 SSE 草案

当前：草稿创建/查询及阶段4B阵容生成/确认HTTP已实现；运行/停止/SSE仍为未来设计。用户P6确认4A阵容设计，阵容当前字段以本文末节和[lineup-design.md](lineup-design.md)为准。所有正文UTF-8，JSON是API传输格式，不直接作为页面文本。

阶段2/3小节保留其历史背景；下方“阶段4B阵容HTTP增量”覆盖新状态、版本、错误和前端解析。确认与开始严格分离，本轮不新增运行接口。

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
