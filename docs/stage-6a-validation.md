# 阶段6A：真实讨论适配器与本地契约验证

日期2026-09-16，Asia/Shanghai；根目录`D:\实测文件夹`；起点`0f767fe`。原始请求[P13](sources/stage-6a-request.md)，[计划](superpowers/plans/2026-09-16-stage6a.md)。官方模型/模型列表/余额请求均0；没有读取用户私有配置、4D预算或验收库，没有启动live:stage4d。开发工具Codex，沿用项目级schen身份，无依赖或Skill安装、子代理、worktree、远程推送。

## 1. 实现及边界

|职责|实际文件|行为|
|---|---|---|
|四能力|src/providers/deepseek-discussion.ts|assessIntent/generateUtterance/extractSynthesis/summarize，复用原DiscussionProvider及四parse校验器|
|应用提示词|src/providers/discussion-prompt.ts|显式system规则、user JSON数据；每次重新构造同场公开上下文，主持任务purpose区分，无工具/隐藏推理要求|
|共享传输|src/providers/deepseek-transport.ts、deepseek.ts|固定官方地址、鉴权、禁止重定向、完整响应期限/取消、外层解析和安全指标；阵容仍4096上限及原校验语义|
|独立配置|src/providers/discussion-config.ts、.env.backend.example|DISCUSSION_PROVIDER默认fake，独立ROSTER_PROVIDER；缺配置或缺显式transport报错，无回退；正常server仍显式Fake|
|本地组合|scripts/lib/discussion-stub.mjs、scripts/stage6a-backend.mjs|真正loopback HTTP，按实际task/input应答；虚拟凭据，不是FakeDiscussionProvider替代适配器|
|测试及界面|tests/*/discussion-adapter-*、playwright.stage6a.config.ts、e2e-local、web/src/provider-label.ts|正式runner/SQLite/SSE/页面接线，正常/总结失败两场；仅测试标签改变，不重做演播厅|

运行时提示词不代替开发Prompt。数据复制白名单，当前transcript全部传入；已有观点带覆盖版本，最终总结仍带最后发言。话题/角色/发言不能提升为system指令。系统ID、角色选择、公平计数、数据版本和终态继续由应用负责。每次调用仅一次HTTP尝试；JSON修复、网络恢复均由原runner共享两次预算。

|操作|输出max_tokens|既有业务限制|
|---|---:|---|
|意愿|512|可不申请、公开关注点≤80码点、已有引用≤3|
|公开发言|768|1–2句，每句≤160码点，主持opening可无引用，其余至少1条|
|共识/分歧|4096|≤12条，证据必须存在且至少来自两位专家，分歧两方引用并集一致|
|总结|1024|1–2句，总长≤320码点，不遗漏最后transcript|

公开上下文96KiB（继承runner）、user JSON128KiB、输出content16KiB、外层响应128KiB；超过明确失败，不裁剪、补证据或静默丢末条。字节/码点与精确token量不同，不估费用。协议核对来自官方[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)及[JSON模式](https://api-docs.deepseek.com/guides/json_mode/)公开文档：显式JSON提示、固定非流式请求；上游非流式和下游业务SSE保持区分。

保留2场、每场/全局2/4并发、30秒完整请求、10分钟运行、60秒收尾、B(N)=28N+56/总结预留2。测试断言对保守计数和实际本地HTTP次数分别检查；这些程序限制不构成真实请求授权。

## 2. 真实TDD及问题记录

|证据|RED|GREEN|
|---|---|---|
|adapter-red.json → adapter-green.json|21:06:49两项业务失败：骨架返回undefined、未拒绝非法输出；退出1|21:09适配器2+阵容31共33通过；退出0|
|config-red.json → transport-green.json|独立选择未实现，缺配置未拒绝、deepseek仍为fake；2失败，退出1|独立配置+HTTP+阵容共54通过，退出0|
|label-red.json → label-green.json|本地适配器页面仍标Fake，1失败，退出1|显式只读测试标签，1通过，退出0|
|network-red.json → network-green.json|测试网络包装直接透传，未拒绝非loopback；1失败，退出1|传输前地址限制，1通过，退出0；失败用例底层为内存mock，没有发出官方请求|

更多HTTP/runner边界是首轮通过的补充契约回归，不把它们虚构成独立RED。共享传输最初`unknown`异常未收窄导致TypeScript报TS18046，属于编译问题，不计业务RED；补`instanceof Error`保持安全分类。第一次完整后端预检358通过/1失败：并发指标按完成顺序返回，测试误要求发送顺序，详见preflight-failure.json；改用taskId集合及任务属性检查，未改变业务实现、未增加sleep或自动重跑。最后所有验证在修正后运行。

## 3. 最后完整验证

执行 `node scripts/stage6a-verify.mjs`；开始21:20:58（13:20:58Z），本地浏览器测试21:24:25前完成。逐项真实命令/开始结束时间/输出及退出码保存在[完整报告](../evidence/stage-6a/verification-2026-09-16T13-20-58.335Z.json)。不是沿用5C历史成功。

|层次|本轮结果|退出码|
|---|---:|---:|
|后端Vitest|359通过，167单元+192集成，0pending|0|
|前端Vitest|88通过，0pending|0|
|5C原有Fake浏览器E2E|37通过，0skip/0flaky/0retry|0|
|真实适配器本地HTTP浏览器E2E|2通过，0skip/0flaky/0retry|0|
|后端/前端/E2E类型检查|三项通过|各0|
|后端编译/前端构建|两项通过|各0|
|正式进程阵容HTTP冒烟|初始化重复安全、创建/查询/生成/确认及重开成功，自有子进程退出|0|

新后端36项：适配器单元2、独立配置2、测试网络边界1、本地HTTP21、正式runner接入10。已有阵容DeepSeek26单元+5HTTP+13pipeline及保护测试均在359中重跑通过；共享传输未破坏原行为。既有预算/期限/003/SSE/恢复等测试同时回归。

本地HTTP覆盖：四任务请求/正确鉴权/固定参数/独立上下文；topic注入不进入system；最新内容及两场分离；不申请、空共识；错误角色/字段/句数/引用；非JSON/空正文/截断finish_reason；永久错误一次发送、恢复/修复最多两次；响应头/空白后仍受完整期限约束；普通取消和独立总结；迟到发言及服务关闭后迟到总结不得写终态；普通预算不吃总结预留；usage缺失“未取得”。原共享传输回归另覆盖外层异常、重定向、体积及安全字段。

测试网络采用虚拟凭据；Vitest setup阻止非loopback fetch，stub桥接先校验适配器请求官方URL再明确改到本机，生产地址验证保持不变。浏览器后端只注入这一桥接，其余fetch拒绝。没有为了证明上限发送任何真实请求。共享传输安全诊断仅允许字段，不保存messages、请求头、reasoning或上游错误正文。

## 4. 页面与持久化证据

标签统一为**真实适配器经本地 HTTP 替身验证**。本轮阵容仍由Fake生成确认；讨论四能力确实走真实适配器及本地HTTP。前端41871、后端41872、本地stub随机端口；独立`.tmp/stage-6a/browser-*`库。未访问4D库。

- 正常：discussion `196e6ff3-edc5-4f43-8105-f79c2a7c48ff`，run `4ee6c781-d3c3-43b0-89d9-7f6dd040e8ad`；中途3条发言即有观点，终态13条，11次提炼，最后观点覆盖12/总结覆盖13；本地49次＝1开场+24意愿+12专家+11提炼+1总结。保存/展示/确认阵容/运行/刷新一致。证据[local-success.json](../evidence/stage-6a/local-success.json)。
- 总结降级：discussion `ded2f26c-568e-4250-ae97-8c443ece5ac6`，run `6674fcdf-c065-4b5a-980c-35b243aa3e4f`；13条发言保留，2次总结503后completed+unavailable，文本为null；本地50次，刷新一致。[local-failure.json](../evidence/stage-6a/local-failure.json)。
- 截图实际查看：[中途观点](../evidence/stage-6a/screenshots/local-running.png)、[正常总结](../evidence/stage-6a/screenshots/local-completed.png)、[刷新恢复](../evidence/stage-6a/screenshots/local-refreshed.png)、[总结失败](../evidence/stage-6a/screenshots/local-summary-unavailable.png)。原37 E2E新截图也写6A目录，5C历史截图未改。

stub usage是人工固定的协议测试值，不是真实供应商用量，不估费用。讨论文本刻意确定，不证明真实语言质量或多样性。浏览器测试使用业务状态断言及测试模型边界文件门闩观察中途状态，无整场重试/固定等待蒙混通过。

## 5. 资源、Git和限制

实际代码提交：`8808f5b`（四能力/共享传输/独立配置及后端契约）、`ead5502`（本地HTTP页面接入、测试标签及回归取证脚本）。完整测试运行于基线+工作树修改，随后提交；[source-and-scope.json](../evidence/stage-6a/source-and-scope.json)保存32个源码/配置哈希并在两次提交前逐项比对，确认没有测试后代码漂移。最后单独提交本轮文档/证据，未重写历史或推送。

Playwright两轮本地接入和一轮Fake回归均已退出，测试连接/runner/HTTP stub按夹具关闭；41861/41862/41871/41872无监听。Windows进程树退出后留下3个本轮test.sqlite.owner，逐个核对PID不存活、绝对路径在已知.tmp测试目录后仅删除owner，数据库保留；详见[cleanup.json](../evidence/stage-6a/cleanup.json)。未触及用户其他服务、私有配置或真实调用授权。

已知非阻断提示：Playwright子进程NO_COLOR/FORCE_COLOR提示、Git既有LF/CRLF提示；没有修改全局设置。没有真实讨论语义质量、供应商延迟/可用性、真实token/费用或生产负载证据。输入分离和JSON字段验证不能彻底解决提示注入，也不能自动验证自然语言证据支持关系。小窗显示仍仅现有公开字段。真实模式配置不会自动赋权，本轮未建立6B官方入口。

## 6. 6B建议（待另行授权，未实现/未执行）

**建议目标：**“AI如何改善教育？”；2专家+1主持；使用新建库中预置、人工审阅的教育实践/教育公平两类公开角色，经现有确认流程绑定版本，角色为虚拟角色且注明来源。无需再调阵容模型；阵容请求上限0。若改为模型生成阵容，须另行列明独立授权/预算，不占用或重启4D记录。

计划2次成功专家公开发言，第一次后1次中途提炼，第二次提交后直接收尾；因此该短样本中提炼可能合法为空（当时只有一位专家发言），不能强造共识。总结读取全部3条发言。正常路径：1开场→2意愿并发→1专家→1提炼→2意愿并发→1专家→1总结，**9次**。协调器仍按内容选人，不保证两专家各发一次；若需验证真实双专家有依据的共识，应另议更长样本，不偷偷加调用。

建议真实请求总硬上限**20次**，其中最后2次仅总结，普通至多18；重试、输出修复、额外主持介入全部包含在20内，首次成功不重试、401/400等永久错误直接停。正常9次不是承诺；无人申请/多人竞争/主持介入会改变路径，最多2次主持介入，预算不足则提前收尾，不能为完成目标超额。不开“额度用满”循环。

建议普通运行最长120秒（从running起算，含排队），收尾仍60秒，总运行窗口最多180秒；单调用仍30秒，队列/重试受更短剩余期限约束。四任务token上限保持512/768/4096/1024，不增工具/思考/token流。只做一场真实验收，不启用第二场官方并发，原每场2/全局4上限保留。

**当前不具备短验收参数或一次性真实讨论授权入口。**5B的12次/10分钟、B(N)及存储相关约束在多处使用，本轮没有改。6B前需单独批准并TDD最小运行限制注入（默认仍原值），在新库把2次/120秒/20次作为这一run的服务端约束持久化；不能用浏览器计时点击结束冒充硬边界。另建独立6B持久化授权记录：绑定唯一discussion/run/阵容版本/模型/参数/期限；每次发送前持久化预扣，未知/超时不退还，不能通过重启、换库、换run重获额度。

成功或终态失败即关闭授权，保留计数/绑定。普通预算耗尽只允许剩余总结额度；无额度/期限则按原降级语义结束。永久错误直接失败；响应结果未知先读同场状态/计数，禁止重建或外层补发，取消不证明供应商未执行。重启按现有中断恢复，不自动续跑；新一次真实讨论必须再次授权。新的数据库/授权文件必须隔离4D；本轮尚未建立或读取它们。

**本轮已实现真实讨论适配器并完成本地替身验证，官方模型请求为0次，真实讨论质量尚未验证。** 停止于6A，不执行6B。
