# 阶段5B验证：Fake讨论执行器、003与核心TDD

执行日期：2026-09-16（Asia/Shanghai）；根目录 `D:\实测文件夹`。起点 `aef075d`，当前分支main，沿用项目身份schen。用户原文P11见 [开发Prompt归档](sources/development-prompts.md)，实施分解见 [计划](superpowers/plans/2026-09-16-stage5b.md)。本文记录实际执行，不将5C或真实讨论质量写成通过。

## 1. 本轮交付和边界

- 003显式非破坏迁移；独立DiscussionProvider四能力、确定性Fake、运行时校验、共享调用槽；DiscussionService负责单场runner、调度、串行综合、独立总结取消域。
- `lineup_confirmed → running → stopping → completed`；致命错误/重启中断为failed。终态不重新开播；同开始幂等键返回原run及当前快照。GET、列表、重复开始不创建第二runner。
- 真实SQLite公开记录与事件同事务写入；新增start/stop HTTP；前端仅严格解析新运行分支和中文状态。没有开始/结束按钮、Transcript、小窗、观点区或SSE路由。
- 普通入口显式使用Fake，讨论无真实适配器；未安装依赖、未读取密钥、未启动/修改stage-4d-live，原预算不读取、不复用、不重置。原DeepSeek测试仅沿用注入传输/本机stub，不能理解为官方请求。

## 2. 迁移与存储

`schema-v1.ts`/`schema-v2.ts`不变；`schema-v3.ts`与迁移账本新增003。空库001→002→003；冻结真实002夹具升级，逐列比较全部旧discussion数据、确认时间、幂等字段、成员和原事件。未知对象拒绝，003完整性失败整批回滚，重复执行及重开通过。只操作测试自建数据库；没有迁移开发库、用户业务库或4D验收库。

新增表：utterances（同场/run/member、唯一seq）、findings、finding_evidence（同场真实发言）、role_public_states。discussion增加run标识/epoch/期限/终态、内容版本、调用计数与总结等必要列；public_events保留历史主键与payload，扩展七种事件。外键、唯一键、CHECK在真实SQLite验证。启动只检查schema；升级仍需显式db:init，维护入口保留既有备份逻辑。

每个公开写事务version+1、lastEventId按事件数增加；eventId在discussion内连续，多个事件可共享dataVersion/occurredAt。内部预算不制造公开事件。confirmedAt保留实际确认时间；transcriptVersion只随已提交发言增加，不被状态小窗改变。写入或事件失败整批回滚；发言、综合和成功总结提交前再次核对原期限，到期则连事件一起回滚。

## 3. 调度、综合和总结

当前已提交transcript → 受限并行收集各专家意愿 → 全批结束后按有效申请协调 → 所选专家生成1–2句 → 校验并提交 → 非终结轮综合检查点 → 下一轮。

内容关联/引用决定申请资格，持续等待仅作辅助；等待及成功次数以实际提交更新。有可用替代者时避免连续第三次；其他候选发言均失败后允许原候选兜底，单专家不会被公平规则卡死。无申请时主持澄清一次后再征集，仍无人则收尾；最多两次额外主持介入。开场不计专家次数，总结单独计数。单个专家失败尝试耗预算但不计成功发言；主持必要发言失败是致命错误。

提炼仅引用本场已提交发言，支持空items；共识需要至少两位不同专家证据，分歧需不同立场及证据。新组替换旧组，sourceTranscriptVersion严格对应当前内容且大于已应用来源。一次提炼失败保留旧组及来源；连续两次失败收尾。最后第12条专家发言不再启动普通提炼，总结直接读取完整最终transcript。

停止统一冻结内容并推进epoch，取消普通任务/排队；总结使用独立取消域，最多两次，含排队受60秒总期限限制。普通取消不会误杀总结；迟到结果不落库。正常总结失败为completed+summary.unavailable及安全提示，不伪造正文；零发言跳过总结调用。永久配置、主持失败、致命存储或重启中断为failed；若连失败状态也无法保存，HTTP安全503，不假装已持久化失败。

## 4. 调用预算、并发和期限

预算依据原规格：两次尝试乘以〔开场+总结2项、12轮×(N次意愿+发言+提炼)、最多2次主持介入及再征集×(N+1)〕。

`B(N)=2×[2+12×(N+2)+2×(N+1)]=28N+56`。

| 专家N | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| 总尝试上限 | 84 | 112 | 140 | 168 | 196 | 224 | 252 | 280 |

两次总结包含在总额内，普通任务最多B−2；失败替补同样扣总额，因此该预算不是保证12轮全部完成的资源承诺。真正取得调用槽、准备调用时原子预约，排队未执行不计；发送后的失败/取消不退还。网络重试与结构修复共享每逻辑任务最多两次，仅服务层重试。

running/stopping合计最多2场；阵容与讨论在普通入口共用CallLimiter，每场2、全局4，排队每场8/全局20。单次30秒、任务60秒、运行10分钟、收尾60秒均包括适用剩余期限；测试用可控时钟而非真实等待几分钟。最后额度竞争、总结预留、排队取消、两场隔离和跨阵容共享槽均通过。Fake中已取消/迟到Promise不会回写或继续派发；这不证明未来远端供应商会因本地取消而停止计算。

## 5. HTTP与前端

| 操作 | 精确输入 | 实际行为 |
|---|---|---|
| POST /api/discussions/{id}/start | `{requestId,generationId,lineupRevision}`，UUID和当前正整数版本 | 首次202；同键或同阵容双Tab运行中200 `{discussionId,runId,snapshot,replayed}`；旧绑定409 |
| POST /api/discussions/{id}/stop | `{}` | running/stopping返回202快照；completed/failed返回200；不重复总结 |
| GET /api/discussions/{id} | 无正文 | 原created19字段、阵容21字段保持，运行24字段，含runtime/roleStates/synthesisState |

HTTP测试覆盖400/404/409/429/503、安全异常、不存在SSE路由，以及真实Express/SQLite正常链路。前端保留19/21字段严格校验，新增24字段联合校验；非法引用、时间或状态仍拒绝。运行态仅中文标签/总结不可用提示，旧阵容动作禁用；现有生成轮询不改为讨论轮询或SSE，观察更新目前靠手动重新读取。

## 6. 实际测试与命令

以下均本轮新执行。验证脚本用当前node直接运行package脚本对应的本地CLI；完整参数、时间、退出码在JSON证据中，不依赖探针node_modules。

| 层次 | 最新结果 | 退出码 | 证据 |
|---|---:|---:|---|
| 后端Vitest（30文件） | 314：161单元+153集成（HTTP计入集成，不重复相加） | 0 | [最终后端记录](../evidence/stage-5b/verification-deadline-fix.json) |
| 前端Vitest（7文件） | 76 | 0 | [完整验证记录](../evidence/stage-5b/verification.json) |
| 后端/前端/E2E TypeScript | 三项通过 | 各0 | 最终后端、完整记录和[最终E2E记录](../evidence/stage-5b/verification-final-e2e.json) |
| 后端编译、前端构建 | 两项通过 | 各0 | 最终后端与完整记录 |
| 旧草稿/阵容浏览器E2E | 26通过，0失败/跳过/flaky | 0 | 最终E2E记录；这不是讨论演播厅E2E |
| 原阵容HTTP冒烟 | 通过 | 0 | 完整记录，`node scripts/http-smoke.mjs --lineup` |
| 最终Fake讨论HTTP轨迹、重开读取和退出 | 通过 | 0 | [最终轨迹](../evidence/stage-5b/fake-trace-final.json) |

后端314包括所有既有254测试和新增60测试；新增migration4/store10/runner12/controls7/HTTP6/ownership1，以及domain15/Fake2/limiter3。旧历史迁移断言从“002是当前版本”改为“002需要显式升级”，继续验证002指纹和旧数据，不删除校验；旧HTTP冒烟将期望账本扩为[1,2,3]。

完整首轮308、补充回归311的记录原样保留，最终以314为准；不是三组相加。前端和26E2E在最后SQLite期限修复前已通过且未发生相关前端改动；期限修复后重跑全部后端、类型、编译及最终真实HTTP Fake轨迹，没有把未重跑层写成修复后的再次运行。

验证JSON中的codeRevision是执行当时HEAD，测试同时包含当时尚未提交的工作区变更；最终期限修复及补充测试随后提交为72fcb21，最终Fake轨迹基于该已提交生产代码。不要把较早HEAD字段当成没有工作区修改的独立复现标签。

复验命令（项目根目录，已有依赖）：

```powershell
npm test
npm run test:web
npm run typecheck
npm run typecheck:web
npm run typecheck:e2e
npm run build
npm run build:web
npx --no-install playwright test --config playwright.stage5b.config.ts
```

本轮记录入口为 `node scripts/stage5b-verify.mjs`，补充使用`--backend-only`、`--e2e-only`、`--deadline-fix`；已有证据时脚本拒绝覆盖。Fake轨迹脚本同样拒绝覆盖已有轨迹，不能直接重复运行来覆盖证据。产品启动仍用`npm run db:init`（仅对自己明确选定的库）及`npm start`；先读README维护说明。

## 7. 代表性真实RED→GREEN

| 行为 | 实际RED | 最小实现/修正与GREEN |
|---|---|---|
| 真实002升级003 | 业务失败MIGRATION_TARGET_UNSUPPORTED | 新003及迁移校验，4项migration通过 |
| 领域输入/输出、开始与原子写入 | 领域15项、存储6项对未实现骨架失败 | 校验、CAS及事务后同组通过，再补边界 |
| runner有限运行与收尾 | runner12项对未实现行为失败 | 分步实现调度/总结/预算；单次timeout误当cancelled修正后通过 |
| HTTP start/stop | 4项请求得到404而非约定状态 | 路由与服务接线，同组通过 |
| 新运行快照 | 前端6项被旧解析器拒绝 | 严格运行分支后通过，最终该文件7项 |
| 主持串联失败 | 预期failed却得到completed | 修正主持异常分类，不吞成提炼失败，回归通过 |
| 写事务内结果刚好到期 | 3项期望false却true，发言/提炼/总结均可复现 | 提交前期限检查及完整回滚；同3项GREEN，store/runner/HTTP合计28通过，最终后端314通过 |

最后一组RED运行时间19:25:05，退出1；修复后同文件及runner/HTTP运行19:28:51，退出0。全部最终后端验证19:29:40开始，退出0。上述真实执行来自当前工具运行，不事后伪造失败日志。新增的补充回归若首次即通过，只作回归证据，不冒称独立RED。

真实问题还包括：002 fixture的LF归一化校验和问题、测试中Promise接口的TypeScript目标不匹配，均属测试准备问题，不算业务RED；时间戳分别采样造成2ms偏差已改为从持久化开始时刻推算期限，并经前端真实快照解码验证。

旧E2E曾硬编码4D截图路径，首次回归更新了15张历史图。已先另存5B，再从HEAD逐个恢复4D原图，并只将4个E2E文件的截图路径改为stage-5b；重跑26项通过。历史截图最终无差异，没有改写4D验证证据。

## 8. 最终完整Fake轨迹

生产代码版本 `72fcb21`；discussion=`d9c1f026-79e1-4314-88f3-74a40ef978f6`，run=`ce56a9e1-fbf1-4ada-b3fb-838ac313d6c4`。独立临时库 `.tmp/stage-5b/http-*`，loopback临时端口，不读取私有环境配置。

1主持开场+12专家回应，共13条公开发言；11次中途提炼，最后总结来源版本13，完成原因为turn_limit。73次Fake调用＝1开场+48意愿+12发言+11提炼+1总结，限额168，非真实模型请求/费用。重复start/stop及服务重开GET保持同一终态；确认时间未改写。

两次自有进程PID19984/16240均退出0，端口关闭、数据库连接关闭、占用文件释放。首条Fake轨迹也保留，不能与最终样本混作同一讨论。截图位于 `evidence/stage-5b/screenshots/`，只证明旧草稿/阵容浏览器回归，不制造尚未实现的讨论UI截图。

## 9. 限制与下一阶段

S5-01至29逐项映射见test-plan新增5B表。SSE、游标补发/背压、跨Tab实时观察、演播厅及其完整E2E全部仍计划5C；未来真实讨论质量检查另行授权。字符串/证据格式校验不等于观点在语义上受证据支持，也不证明模型抵抗所有提示注入。

普通入口单进程、单库；`.owner`阻止误启动第二实例，不是跨进程调度。异常断电遗留占用文件需人工先确认原进程已退出，再处理占用；程序不会自动删除未知占用或自动续跑。Fake预算/并发测试不是生产负载或远端取消保证。

本轮讨论能力仅由 Fake Provider 验证，未调用真实模型，未完成 SSE 或完整演播厅 E2E。完成后停止，等待5C授权。

## 10. 文件自查与提交

静态自查退出0，见[检查记录](../evidence/stage-5b/review.json)：60份变更文本的敏感形态检查为0，历史Prompt前缀及P11原文完整，001/002、真实入口/适配器、4D截图和4D-B证据无改动；围栏及选定文档相对链接有效。`git diff --check`、两份新验证脚本`node --check`均退出0。私有配置仅检查Git忽略/跟踪状态，未读取正文；已忽略且未跟踪。最终E2E端口41841/41842无监听，最终Fake PID均已退出；没有结束其他进程。

本轮实际提交顺序：5f690d6迁移003与计划/P11；77253bc领域/Fake/调用槽；43850f1持久化与原子事件；3c0f926执行器；9bfae31 HTTP/启动恢复；aafcbfc前端兼容；72fcb21提交前期限修复及补充回归；后续验证工具和本文证据单独提交。最终文档提交号以Git日志为准，避免把提交自身哈希写入产生递归修改。没有重写历史或推送。
