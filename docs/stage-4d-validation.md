# 阶段4D验证记录

## 授权及实施顺序

A：配置/提示词→原生fetch适配器→重试/取消局部修正→持久化一次性验收保护→本地HTTP stub/正式业务集成→回归/构建。每项先行为RED，再GREEN，按实际完成提交。
B：必须待用户在.env.backend.local配置并回复“已配置”。指定“AI 如何改善教育？”、4专家另加主持人；唯一discussion/generation，累计最多2次真实请求，首次成功即关闭；无Hello/余额/模型列表探测。当前真实请求0，授权未激活。

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

## B：真实联调未执行，停在密钥交接

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
