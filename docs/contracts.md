# HTTP 与 SSE 契约草案

阶段1A协议草案在阶段2局部落实：仅POST创建、GET单条与列表已实现，其余HTTP/SSE仍为设计，未实现。技术基线已确认，默认运行参数/总结句数已在阶段1B获得用户确认；其余具体路径、字段、校验阈值和错误码仍为C类设计建议。使用 `/api` 前缀；所有正文 UTF-8，JSON 是传输格式，不是直接显示给用户的文本。

## 标识、版本与公开类型

| 字段/类型 | 定义 |
|---|---|
| discussionId、roleId、utteranceId、findingId | 服务端生成的不透明 UUID；查询及引用必须验证归属，UUID 本身不提供授权 |
| status | created / generating_lineup / awaiting_confirmation / running / stopping / completed / failed |
| version / dataVersion | 同一场公开数据版本：快照字段为 version，事件字段为 dataVersion；每次原子变更加1，不保证与事件数相同 |
| eventId / lastEventId | 同一场持久化公开事件正整数序号；初始快照无事件时 lastEventId=0；不同场编号可重复 |
| transcriptVersion / seq | 公开普通发言的版本/序号；初始0，每条发言加1，Summary 不计入 |
| lineupRevision | 阵容版本；初始0，有效阵容生成完成变为1；MVP 暂不支持确认页编辑和换人 |
| confirmedLineupRevision | 尚未确认时为 null，成功 start 后固定为确认的版本 |
| sourceTranscriptVersion | 综合/总结依据的 transcript 版本，由后端请求上下文设置 |
| Role | id、discussionId、kind(host/expert)、name、title、stance、color、status(idle/preparing/speaking)、publicFocus(string或null) |
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
| POST /api/discussions/{discussionId}/lineup | 请求动态生成；空JSON对象 | created首次受理202；正在生成202；awaiting_confirmation返回现有快照200；body为快照 | 原子 created→generating_lineup；并发/重试不能重复安排任务。running及其后状态409 INVALID_STATE；404不存在；全局工作队列无空位429 CAPACITY_REACHED。生成失败异步回 created+notice，可再次请求 |
| GET /api/discussions/{discussionId} | 阵容、观察、结束记录的初始/重置快照 | 200快照；Cache-Control: no-store | 404不存在；无启动、确认、模型调用等副作用 |
| POST /api/discussions/{discussionId}/start | 用户确认当前阵容并开始；body：lineupRevision | 首次202快照；相同已确认版本重复200当前快照 | 未完成生成409 LINEUP_NOT_READY；版本错误409 STALE_LINEUP；已启动且版本相同即使已结束也只返回现状，不重新启动；运行槽满429 CAPACITY_REACHED；生成失败尚无有效阵容不能开始 |
| POST /api/discussions/{discussionId}/stop | 提前结束运行；空JSON对象 | running首次202快照；stopping为202；completed/failed为200 | 每个讨论最多安排一次终结总结；重复请求不增加runEpoch、不重复总结。created/generating_lineup/awaiting_confirmation返回409 INVALID_STATE，不将离开确认页等同停止 |
| GET /api/discussions/{discussionId}/events | 订阅本场公开事件；query after=非负整数；自动重连可带Last-Event-ID | 200 text/event-stream；具体见下 | 404不存在；400无效游标/UUID/跨讨论游标。断线与重新订阅都不启动/停止讨论 |

没有独立的 `/confirm` 和第二个启动按钮；“确认并开始”一个原子操作避免确认成功但重复启动的歧义。进入stopping起60秒内完成总结（包含排队、调用、重试），否则summary.status=unavailable并进入completed；迟到总结拒收。开场失败后 status=failed；重复 start 返回该现状，不能用重复请求实现未设计的重跑功能。

生成阵容、start 和 stop 的202仅表示受理，之后依赖快照/SSE观察成功或失败，不等同模型成功。HTTP连接在受理后断开不取消任务。客户端写操作失败时可查询快照再决定重试；创建始终复用原 requestId，防止网络错误产生重复讨论。

## 运行时校验

共享 TypeScript 类型仅用于编译期；服务端在 JSON 解析后必须运行真实 schema 校验，并执行数据库关联验证。阶段2使用小型手写运行时校验与字段白名单，不新增schema框架；未来模型输出仍必须真实校验，不能用 `as Type` 代替。

| 边界 | 校验规则（长度均为Unicode码点，数字为C建议） |
|---|---|
| HTTP | 限JSON正文16KiB；拒绝null/数组充当对象；UUID格式、整数范围、枚举、未知字段、空白topic；expertCount不可是字符串/小数/NaN；持久化规范化topic |
| 阵容输出 | 对象只含roles数组，每项kind/name/title/stance；恰好1位host及expertCount位expert；name 1–64、title 1–80、stance 1–200，去首尾空白且非空，显示名不重复。id及颜色由后端赋值，颜色从经对比度检查的角色配色集合选择；模型不可自行设discussionId |
| 意愿输出 | wantsToSpeak布尔；intent仅answer/supplement/rebuttal/question；replyToUtteranceIds为本场已存在ID数组；publicFocus为null或1–80字符的独立公开关注点；不接受reasoning/score/debug等额外字段 |
| 普通发言输出 | sentences恰好1–2个非空纯文本字符串，每项建议至多160字符；replyToUtteranceIds只引用本场请求快照中已有发言；后端设置roleId/seq/版本。拒绝明显序列化对象/数组或HTML作为“公开句子”，不执行HTML；句界除数组约束外做中文终止标点检查，缩写/引文边界列入人工质量检查 |
| 共识/分歧输出 | items建议至多12；kind合法、text 1–300字符、evidenceUtteranceIds非空且全部属于本场请求快照；服务端生成findingId和sourceTranscriptVersion。分歧验证不同角色证据，空items合法且不虚构共识 |
| 总结输出 | 只含text，1–2句、建议至多320字符的自然语言，使用与普通发言一致的句界校验原则；拒绝JSON对象/数组原文、隐藏推理字段或诊断文本；总结单独展示，不写入Utterance |
| 提交结果 | 当前discussionId、status、runEpoch、源transcriptVersion必须满足该任务的提交条件；不匹配即丢弃，不能让重试结果越过stop或新版本 |

模型供应商可能用JSON文本封装对象，适配器可以解析一次指定内容字段再校验；解析失败走有限重试，不能靠“找第一个大括号”猜取或把原文转成发言。供应商 envelope 的推理/诊断字段在适配器边界丢弃；模型正文里出现未知字段则校验失败。输入topic及transcript按不可信数据区块传入，不覆盖系统职责。

纯文本显示使用框架转义，不使用 dangerouslySetInnerHTML；禁止以“调试模式”把原始输出展示给用户。公开关注点由专门字段生成和筛选，不从隐藏推理或内部评分重写而来。schema不能完全证明文本语义安全，仍需T13恶意输出样例与T18人工检查。

## SSE 公开事件

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
