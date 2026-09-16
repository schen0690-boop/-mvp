# 阶段6B验证记录

## 范围、来源与准备版本

用户P14已授权一个预置阵容真实讨论：AI 如何改善教育？；2专家/2次成功专家发言/1次中途提炼/唯一总结；普通120秒、总结60秒、完整单次30秒。固定deepseek-flash、disabled、非流式json_object、无tools；意愿512/发言768/提炼4096/总结1024。不是4D授权续用，不读取或改动4D记录。正常启动、默认12次/10分钟/003/B(N)均保留。真实样本运行版本将在准备提交后由一次锚点固化。

林知远（虚构）主持；陈思敏（虚构）关注教学反馈/教师负担与可评估试点；周衡（虚构）关注公平/隐私/偏差。阵容为本地预置，通过原LineupService校验、系统赋值、保存和确认，不使用模型生成。角色ID/颜色/顺序/时间由既有逻辑产生。

## 本地实现与TDD

- Store仅为绑定run注入短参数与beforeStart claim；runner依据持久化deadline，第二专家发言原子进入stopping，中间只一次提炼，默认行为回归不变。
- DiscussionAuthorization固定锚点/独立库/manifest/started/closed；普通18和总结2独占slot创建并fsync，发送前预约，已占用不退款；summary绑定唯一task，两次尝试共享预算。
- GuardedDiscussionProvider核对run/epoch/source/status/阵容/固定参数，禁止其他讨论和阵容外呼；没有额外重试。普通授权不足沿既有收尾，不借总结额度。指标只白名单，不保存请求头/messages/原始响应。
- 代表业务RED：short-red中绑定run未实现，1失败；authorization-red中预算/绑定及新增指标未实现；guard-red中发送未预约；label-red中来源标签错误；short-ui-red中120秒快照被拒绝。对应green与最终回归保存同目录，没有以语法/路径错误充当业务RED。
- 真实问题：第一次本地浏览器短流程后端完成，但前端固定600000毫秒导致快照拒绝；补复现测试，前端只接受已授权120000或默认600000，未放松其他解析。此时官方请求0。初次失败及后续成功分别保留；不是通过重跑真实场次修复。

## 最后代码修改后的完整本地检查

命令：`node scripts/stage6b-verify.mjs`；2026-09-16 22:11:20–22:15:05（UTC+8），退出0。原始命令/时间/退出码在evidence/stage-6b/verification-2026-09-16T14-11-20.752Z.json。

| 项目 | 本轮结果 | 退出码 |
|---|---:|---:|
| 后端 | 371（单元172、集成199） | 0 |
| 前端 | 90 | 0 |
| 原Fake浏览器E2E | 37 | 0 |
| 原6A真实适配器经本地HTTP替身E2E | 2 | 0 |
| 新受保护短流程/现有页面 | 1，2专家发言/1提炼/1总结，刷新一致 | 0 |
| 后端/前端/E2E类型检查 | 三项 | 均0 |
| 后端编译/前端构建 | 两项 | 均0 |
| 旧阵容HTTP进程冒烟 | 通过 | 0 |

无跳过/自动E2E重试。上述全部本地HTTP/Fake，官方请求0，不计为真实质量。包含旧阵容适配器与003数据回归。短流程SSE记录实际发言seq1/2/3、提炼覆盖2、总结/终态；快stub中途截图错过，用实际事件证据，不补造图片。

安全配置检查`npm run config:stage6b`退出0：Provider deepseek，固定参数匹配，密钥已配置；不输出原值。私有配置及6B库/授权均被Git忽略且未跟踪。启动前41881/41882无监听；原6B目录与锚点不存在。此前旧密钥撤销确认沿用用户明确回复，不索取新密钥。

## 真实执行

待准备代码提交并固化版本后执行，当前本报告不得解读为真实样本已经通过。运行后追加唯一ID、白名单指标、公开内容、实际截图、关闭及只读重开结果；不改变此前测试时间或历史证据。

## 真实验收结论：受阻，未开始运行（追加实况）

准备提交：`c11588f4c1499432651c8f68730fcad3b33ae08d`。2026-09-16 22:18:32（UTC+8）prepare成功，只有本地预置阵容生成/确认；普通生产Fake行为未改。

- 唯一discussion：`a36fb985-9c1b-4a0a-b04b-a66922451732`。
- 授权绑定的预分配run：`d27adb45-8267-4cd3-b834-7f8d6048b372`；**未开始，数据库实际runtime/run_id仍为空**，不能写成已执行run。
- generation：`0e4c3821-3676-46c1-a006-81615f854e56`，lineupRevision=confirmedLineupRevision=1；快照version=4、status=lineup_confirmed。
- 后端41882、前端41881，仅127.0.0.1；私有配置原样保留。固定6B库/授权/锚点保留，没有使用4D记录。

### 停止位置及真实问题

两次启动命令的问题属于本轮临时编排脚本，不是DeepSeek返回错误：

1. 22:19:18首次fork继承了父进程`--input-type=module`，Node在加载服务前拒绝文件入口。现场最小复现为ERR_INPUT_TYPE_NOT_ALLOWED。此时尚无服务、started或计数；修正为fork execArgv=[]后仍使用同一授权和库。
2. 22:20:36受限服务实际启动且报告deepseek/0次。临时就绪循环把原生Fetch的布尔属性`r.ok`误调用为`r.ok()`，捕获TypeError后误当成网络未就绪。15秒后脚本退出触发服务关闭，**22:20:51.908授权按shutdown永久关闭**。还没有启动前端或点击start；没有任何模型请求。

这是执行者启动脚本的错误，不应归因于模型、配置或业务数据。之后只在已关闭授权下GET/展示/刷新，复现`response.ok is not a function`并核对正确检查`if (r.ok)`。GET经原生fetch和node:http均返回200；正确就绪循环实际在短暂ECONNREFUSED后得到200。没有重置授权或将关闭视为可忽略。另一次只读截图脚本未配置baseURL，API相对路径报Invalid URL；明确baseURL后只读展示及刷新通过，没有POST。

真实讨论没有开始。本轮不再补跑；需后续新的明确授权与执行方案，不能删除closed或复用本次20次额度。

### 实际覆盖与计数

| 项目 | 真实结果 |
|---|---|
| 预置阵容保存/确认 | 通过，主持林知远；专家陈思敏、周衡，均明确虚构 |
| 页面阵容展示/刷新 | 关闭授权后只读通过，POST=0、快照相同 |
| 开场/专家发言/中途提炼/总结 | 均0，未执行 |
| 讨论SSE、运行终态和总结刷新 | 未执行；没有completed，不制造成功截图 |
| 发送前保守计数 | 普通0、总结0、合计0 |
| fetch调用证据/HTTP供应商响应 | 均0 |
| 真实阵容请求/真实讨论请求 | 均0 |
| usage与模型请求耗时 | 未取得（没有模型调用），不估算费用 |
| 总结预留 | 授权预留2，实际使用0；不是发送了2次 |
| 20/18/2保护 | 本地测试通过；真实记录未消耗且已关闭，不能转移余量 |
| 停服只读重开 | DatabaseSync readOnly，integrity_check=ok，原快照一致 |

没有真实内容可供语义审阅，因此相关性、回应上下文、证据支持及总结忠实性全部未验证。预置两专家视角分别覆盖课堂实践与教育公平，不能冒充真实模型生成质量。短流程工程链路仅在本地HTTP替身下通过，不是单样本真实讨论通过。

### 证据及清理

`evidence/stage-6b/live/result-summary.json`为脱敏结果；`process-lifecycle*.json`保留启动退出；`startup-diagnosis.json`与`readiness-reproduction.json`为关闭权限后的纯GET诊断；`read-only-ui-final.json`记录只读浏览器退出0与0 POST；`read-only-reopened.json`为公开阵容快照。截图`blocked-confirmed-roster-final.png`及`blocked-confirmed-roster-refreshed.png`只有已确认阵容，不是运行/提炼/总结截图。

所有本轮启动的服务/独立Edge上下文已关闭，后端正常退出0，前端以自有进程SIGTERM结束；没有终止其他进程。核对41861/41862/41871/41872/41881/41882无监听，本轮完整回归时间之后未发现残留owner文件。原始预算、SQLite及配置仅保留本地、被Git忽略。关闭后源码/提示词/参数没有改变，前述全回归仍对应最终业务代码；文档与脱敏证据另行提交。未推送。

## 启动脚本修复与零外呼彩排（P15，2026-09-16；不改变此前受阻结论）

### 实际根因与位置

本轮从实际会话工具记录提取原临时命令，归档`evidence/stage-6b/startup-fix/original-startup-command.txt`，来源元信息见origin.json。它此前**不在项目源文件里**；不能把现有stage6b-dry-run误称为发生ok()错误的文件。归档第18行原生fetch Response被调用r.ok()，同一行catch{}吞掉TypeError，15秒后LOCAL_READY_TIMEOUT；第24行结果恢复检查也误用了r.ok()；第26行将细节压为LOCAL_OR_BROWSER_STEP_NOT_VERIFIED；第29行finally发送shutdown，进入src/live-stage6b.ts第36行IPC处理和第34行stop→auth.close('shutdown')。Playwright的APIResponse.ok()不同，scripts/stage6b-live-ui.mjs中正确调用保持不变。

先用原第18行函数和本机HTTP200复现，未缩短其15秒期限：141次本地读取，原生ok类型boolean，直接错误r.ok is not a function，最终LOCAL_READY_TIMEOUT，15105ms。见reproduction.json；官方请求0。这不是DeepSeek返回故障。

### 最小持久化修复

- `scripts/startup/readiness.ts`：原生Response类型，使用ok属性；检查现有GET /api/discussions/{id}的application/json、完整公开快照（复用web/src/api.ts decodeSnapshot）、discussion/generation/revision及lineup_confirmed。后端和前端代理都取同一快照并比对。没有新增/猜测健康字段或健康接口。
- 明确分类：可识别连接拒绝/重置→SERVICE_UNREACHABLE；完整请求/正文超时→REQUEST_TIMEOUT；404立即HTTP_NOT_READY，503有限重试保留HTTP状态；非JSON/结构或绑定错误→INVALID_SNAPSHOT立即失败。默认总15秒、单次1.5秒、最多100次、检查间隔100ms。只有已识别网络错误进入等待；编程TypeError原样抛出，不吞成超时。
- `owned-child.ts`与`cleanupOnce`仅保存本次创建的ChildProcess/清理闭包，无按端口杀进程或清理未知锁；幂等、逆序清理，即使一项失败仍尝试其他项。IPC显式execArgv=[]，避免继承--input-type。已有端口先独占探测，占用立即退出不复用。
- `scripts/startup/launch.ts`是local/live共用的检查、代理、浏览器和finally清理；只选择不同后端依赖/标记，不另写真实临时脚本。`stage6b.ts`为参数入口。真实分支先验证已准备记录，closed/started/已有计数和testOnly夹具都拒绝，才可能启动服务；本轮**没有调用真实分支**，没有新建可外呼授权。
- `scripts/stage6b-dry-run.mjs`改为编译并调用同一启动入口，保持旧命令可用。local后端只用.tmp/stage-6b中新测试库，prepared明确testOnly=true；local stub传输捕获loopback白名单fetch，未注入的global fetch全部拒绝；虚拟凭据，不加载私有配置。官方适配器固定地址校验没改。
- `tsconfig.startup.json`严格检查新增TS与旧命令JS wrapper（checkJs），产物在忽略的.cache/startup。package增加typecheck:startup/build:startup/launch:stage6b/rehearse:stage6b，无依赖或锁文件变化。局部JSDoc明确local-only fetch类型。runner/Provider/期限/预算/提示词/数据库schema均未修改。

### 真实RED→GREEN与本轮复验

新检查接口骨架先实际失败：red.json中10失败；实现后green.json中10通过。实际子进程清理测试process-red.json失败（缺实现），实现后通过；content-type-red.json中200+text/html错误被当成功，1失败→增加内容类型检查后最终通过。类型检查曾发现fork的ForkOptions不接受windowsHide，移除该不受支持字段，保留无shell、管道及execArgv=[]；此编译错误不算业务RED。首次通过的附加回归不补造RED。

最后脚本修改后最终验证2026-09-16 22:45（UTC+8），见final-verification.json：

| 命令/范围 | 结果 | 退出码 |
|---|---|---:|
| npm run typecheck:startup（tsc -p tsconfig.startup.json --noEmit） | 严格TS/checkJs通过 | 0 |
| npm run typecheck | 后端及导入的脚本测试类型通过 | 0 |
| Vitest startup-readiness/process/prepared + short-discussion/guarded-discussion/discussion-authorization | 28通过 | 0 |
| Vitest web api/lineup-api/runtime-api | 26通过 | 0 |
| node scripts/stage6b-dry-run.mjs（包含启动编译） | 同入口本地短流程通过 | 0 |

第一次`npm run rehearse:stage6b`也实际退出0；最后代码修改后再次运行兼容命令，两者调用同一个launchStage6b。无整条流程自动重试。未重新运行历史371/90/37/2全套成绩，不将其写成本轮新通过。没有修改产品代码，无需机械重跑无关产品测试/完整前端构建。

### 最终彩排证据（仅本地HTTP替身）

结果目录：`evidence/stage-6b/startup-fix/local-2026-09-16T14-45-09.780Z/result.json`。
浏览器公开证据：`evidence/stage-6b/local-dry-gNWzws/`，独立Edge上下文。
测试discussion=`61b5d210-c5ef-4aec-b6b2-d830ace62009`、run=`d8292eed-16b9-433b-b5c9-d7fb905288ec`，不是原真实授权绑定。

后端完整快照校验→前端代理一致→浏览器读取确认阵容→一次start→1开场/2专家发言/1中途提炼/1总结→completed+summary.ready→刷新一致。实际9次loopback HTTP请求，测试预约普通8+总结1；没有官方请求。安全汇总见startup-fix/summary.json，未提交测试授权原始slot。中途快速状态以真实SSE记录为依据，不伪造中途截图。

旧真实6B库、锚点、manifest/closed前后SHA256完全一致（仅字节校验，不以业务服务打开或修改）；原授权仍closed、0次，不创建或激活新真实额度。此前受阻报告及live证据完整保留；4D未访问/修改。模型质量仍未验证，本轮本地成功不能改写为真实6B通过。

清理：彩排浏览器与后端退出0，前端自有子进程SIGTERM；41881/41882无监听。测试清理另证明并发调用幂等、错误后仍尝试全部自有清理、无关服务保持监听、占用端口不会复用或误杀。无未知文件删除/用户库清空。

本地启动条件已具备：之后如获新一次真实验收授权，应使用同一已检查入口，并单独明确新授权的安全建立方式；不能恢复旧closed记录。本轮到此停止，不执行--live、不申请或启用任何额度。

## 6B-R1：新的独立单样本授权（P16）

P16另行批准一场指定短讨论，不是恢复旧6B。固定`.local/stage-6b-r1/discussions.sqlite`、`.local/stage-6b-r1/authorization`、`.local/stage-6b-r1-once.json`；固定证据`evidence/stage-6b-r1/live`。旧6B/4D不改。复用stage6bSettings与预置虚构阵容，20总/18普通/唯一总结2、120/60/30秒及四token上限不变。只有显式--r1选择新路径，拒绝未知或任意目录选项。

准备改动仅路径选择及共享启动收尾观察：launch.ts继续使用513f797的waitForSnapshot和自有清理；浏览器退出后GET同一run，等待有限终态再清理，不重复start或模型请求，不提前误杀合法总结。未改runner/Provider/重试/提示词/业务状态语义。R1模式启动dist/live-stage6b.js --r1，后端明确构造GuardedDiscussionProvider→DeepSeekDiscussionProvider，私有配置只在后端加载；继承环境中的Fake默认不改变此显式入口。普通npm start仍Fake。

本轮前置检查：安全config:stage6b退出0，模型/Provider/参数符合授权、密钥已配置；私有文件已忽略且未跟踪。R1目录和锚点在准备前均不存在，41851/41852/41881/41882无监听。旧6B和4D的10个相关文件仅计算保护哈希，不用旧库执行新业务。

本轮修改后实际定向检查33测试通过（含新路径2条和只读收尾3条）、后端/启动类型检查、后端编译、浏览器脚本语法、共享入口本地短彩排全部退出0，完整命令见evidence/stage-6b-r1/preflight.json。新路径2 RED→GREEN、收尾3 RED→GREEN保留。彩排仍为本机stub，不能当作R1真实结果；此前371/90/37/2为历史成绩，没有机械重跑。

真实执行版本、ID、请求和结果将在本节下追加；准备提交之后至真实终止期间冻结源码/提示词/参数。

### R1实际执行结果：正常路径通过（2026-09-16）

执行源码为`0e7227b5a26cf7072c1db413d84e95f4540528cf`。`npm run prepare:stage6b:r1`、`npm run launch:stage6b:r1`实际退出0；共享launch启动于23:04:41.516、清理结束23:04:52.979（UTC+8）。讨论15:04:44.126Z开始、15:04:51.840Z结束，运行墙钟7.714秒（普通6.870秒、收尾0.844秒）。运行期间及终态后未改源码、提示词、模型或参数。

- 后端`http://127.0.0.1:41882`、前端`http://127.0.0.1:41881`，独立Edge；前端代理完整快照与后端匹配后才点击开始。
- 数据库`D:\实测文件夹\.local\stage-6b-r1\discussions.sqlite`；授权`D:\实测文件夹\.local\stage-6b-r1\authorization`；一次性锚点`.local/stage-6b-r1-once.json`。均不提交Git，不复用旧库。
- discussion=`f56bd564-77c7-4087-b36b-169c43abd162`；run=`cc3a2879-e612-45b0-a51f-17e56e405bf5`。
- generation=`8162dfb4-664b-43f3-9a7f-50ca294e51bd`，lineupRevision/confirmedLineupRevision均1。
- 阵容来源：**本地预置，未在本次通过真实模型生成**。林知远（虚构）主持；陈思敏（虚构）关注课堂实践/教师负担；周衡（虚构）关注公平/隐私。经原校验、保存与确认；真实阵容请求0。
- 官方DeepSeek直连，请求与响应模型均`deepseek-flash`；thinking disabled、stream false、json_object、无tools。四任务token上限512/768/4096/1024；120/60/30秒不变。

### 请求与额度：本轮真实数据

9次发送前持久化计数=普通8+总结1；有fetch调用证据9、HTTP200响应9、业务校验有效9。全部attempt=1、finish_reason=stop，无网络重试或修复调用，无响应未知、无usage缺失。每次请求的内部task标识/时间/请求及响应模型/usage见`evidence/stage-6b-r1/requests-and-result.json`，只归档允许字段。

| 次序 | operation/用途 | attempt | HTTP | 耗时ms | prompt/completion/total tokens |
|---|---|---:|---:|---:|---|
| 1 | generateUtterance 开场 | 1 | 200 | 1385 | 698/49/747 |
| 2 | assessIntent | 1 | 200 | 937 | 805/76/881 |
| 3 | assessIntent | 1 | 200 | 1074 | 805/72/877 |
| 4 | generateUtterance 专家 | 1 | 200 | 1408 | 921/95/1016 |
| 5 | extractSynthesis | 1 | 200 | 560 | 935/5/940 |
| 6 | assessIntent | 1 | 200 | 1105 | 1029/73/1102 |
| 7 | assessIntent | 1 | 200 | 648 | 1029/28/1057 |
| 8 | generateUtterance 专家 | 1 | 200 | 1148 | 1146/101/1247 |
| 9 | summarize | 1 | 200 | 828 | 1215/52/1267 |

已知usage合计prompt=8583、completion=551、total=9134，cache_hit=1920、cache_miss=6663。它是本次响应返回用量，不是完整账单，不估算费用。请求耗时相加9093ms；两组意愿请求并行，因此该总和不是讨论墙钟时间。

授权上限20，普通限18实际8；总结保留最多2次、唯一逻辑总结实际1次。20次并非预先发送20次，剩余11次全部关闭不能再用。SQLite默认技术call_limit仍112，独立授权20更严格；calls_used=9、summary_calls_used=1。没有用真实第21次请求验证拒绝，额度极限及并发保护依赖本轮已通过的定向本地测试与现有保护。

### 工程链路验收

| 项目 | 实际结果 |
|---|---|
| 开始 | 页面一次点击，浏览器仅1个POST /start，绑定唯一run |
| 公开发言 | 1主持开场+2专家，全部经校验正式保存；专家顺序周衡→陈思敏，不要求固定轮流 |
| 中途提炼 | 第一条专家发言后执行并提交1次，sourceTranscriptVersion=2，ready且items为空；没有虚构共识/分歧 |
| SSE | 浏览器实际收到utterance事件8/19/34、synthesis.updated事件23、summary.ready事件37、completed事件38；中途提炼早于第二条专家发言 |
| 收尾 | 两次专家发言后turn_limit，唯一总结任务1次成功；无额外普通发言/第二次提炼 |
| 终态 | completed、summary.ready；snapshot version31、lastEventId38、transcriptVersion3 |
| 展示与刷新 | 运行/中途/终态/刷新4张截图实际查看，页面与公开记录一致；无原始JSON、隐藏推理或诊断对象 |
| 停服后读取 | DatabaseSync readOnly重开同一R1库，通过业务查询层读取；integrity_check=ok，与终态及刷新快照一致 |

完整短内容随着实际过程提交并推送，不是等整场结束播放。GET/SSE/刷新未产生额外模型请求。总结依据transcriptVersion3，包含最后专家发言，不受上次提炼只覆盖版本2的限制。

### 本次公开内容审阅与限制

主持人要求区分改善定义、证据与假设。周衡回应公平和弱势学生参与条件；陈思敏明确补充课堂反馈/教师负担的可评估指标，并回应上一条关于参与条件的讨论。两条reply引用均存在且与内容相符；没有明显互不相关独白或整段机械重复。

中途只有一位专家发言，返回空共识/分歧是允许结果，没有把单人观点包装成全场共识；但**本样本不覆盖非空提炼条目的证据支持质量**。总结保留试点局限和仍待验证的结论，覆盖末条发言；“均指出公平与可评估效果”压缩了两位专家各自重点，不能据此称每人逐项明确赞同。

语义局限：公开发言中“已公开的经验”“只在小范围试点中”等经验概括没有给出具体研究或来源；本轮不能确认这些外部事实。没有明显对立意见或充分争论，不能据此验收深度辩论、争议解决或长期内容质量。没有删改公开结果，也没有追加请求追求更好措辞。

公开原文、运行与中途快照均在`evidence/stage-6b-r1/live/`。此结论仅为**一个指定短讨论样本的正常工程路径通过**；全部话题、专家人数、长期可靠性、生产负载、非空共识质量及提示注入稳健性未验证。

### 证据、验证范围与关闭

- 启动过程：`evidence/stage-6b-r1/launch/r1-2026-09-16T15-04-41.514Z/result.json`。
- 请求与只读验证：`requests-and-result.json`、`public-event-index.json`、`read-only-reopened.json`（均在R1证据目录）。
- 截图：`live/running.png`、`live/middle.png`、`live/terminal.png`、`live/refreshed.png`；本轮没有错过中途截图，没有补跑。
- 实际前置命令与退出码：`preflight.json`；33定向测试、启动严格TS/checkJs、后端类型/编译、浏览器语法、本地共享入口彩排均0。新路径2 RED→GREEN、只读等待终态3 RED→GREEN。旧全量产品成绩未在本轮重跑，不作为本轮新通过。
- R1授权于15:04:51.932Z自动closed，reason=terminal，计数保留9。后端和UI进程退出0，自有前端SIGTERM、独立浏览器closed。端口及锁最终检查见`cleanup.json`。
- 旧6B/4D十个保护文件前后SHA256一致；原6B受阻/0次/closed与4D记录不改，未访问其业务数据执行新任务。真实配置不改、不打印、不提交。

本轮只提交薄入口、定向验证、文档及筛选公开证据；真实结束后仅补文档/证据，无业务代码修改。不推送、不改写历史、不自动执行第二场。本地退出不能证明供应商不存在任何后续计费，账单仍以供应商为准。
