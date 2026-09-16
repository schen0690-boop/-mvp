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
