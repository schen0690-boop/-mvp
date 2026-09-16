# 阶段5C验收：SSE、演播厅与Fake完整核心流程

日期：2026-09-16，Asia/Shanghai。项目根目录D:\实测文件夹，起点main/c35f514。P12真实原文在[sources/development-prompts.md](sources/development-prompts.md)，计划在[superpowers/plans/2026-09-16-stage5c.md](superpowers/plans/2026-09-16-stage5c.md)。沿用项目级schen署名，不改历史、不推送。

## 1. 完成范围

创建草稿→Fake生成阵容→确认→开始→主持/专家公开发言与中途观点→自然或主动收尾→总结/明确不可用→刷新恢复。首页可加入运行讨论，同场观察共享runner，两场独立运行。保留原阵容生成轮询，讨论更新使用SSE。普通入口固定Fake，无需密钥。

本轮没有修改5B调度、预算、期限、003或总结降级语义；没有真实讨论适配器、token流、账户、音视频、暂停/续跑/重新开播。未读取私有配置，未启动live:stage4d，未读取、修改或绕过4D验收库与预算。旧适配器回归仅使用注入传输/本地stub；没有真实模型调用。

## 2. 真实接口与恢复

- `POST /api/discussions/{id}/start`：requestId/generationId/lineupRevision；`POST .../stop`：空对象。沿用5B状态码与幂等。前端busy互斥，409或未知结果先GET，不自动重复POST。终态无再启动入口。
- `GET /api/discussions/{id}/events?after=k`：任意已存在状态均可只读订阅；前端仅confirmed/runtime订阅，终态快照直接关闭。响应text/event-stream UTF-8、no-store、X-Accel-Buffering:no。Vite 41861→后端41862实际流式链路通过。
- 事件编号为讨论内连续序号，与公开version及transcriptVersion分开；有效同场Last-Event-ID优先于URL，非法400。transactionLastEventId标出同事务最后事件，前端完整批次后才公开更新；重复事件幂等，不以相同dataVersion误丢同批事件。
- COMMIT后通知只唤醒按讨论读库；先订阅再一致读取，补发与实时共用游标。回滚不推送。没有通知携带未提交内容或内部Provider信息。
- 未来/缺失/半批游标返回无id的stream.reset并关闭；终态落后补齐后stream.end，终态已追平204。流头已发后异常只reset/关闭，不改写JSON响应。
- 客户端错误时关闭旧EventSource，丢弃半批、保留最后有效内容；1/2/4/8/10秒有限GET恢复，再以新快照游标订阅。最多5次自动恢复，之后手动连接。旧GET/旧讨论回调不能覆盖新状态。恢复只有读取，无生成/开始副作用。
- 心跳15秒仅注释；最多32条完整批次分页；每连接64条/256KiB上限，write=false停读停写，drain恢复、10秒无drain关闭。当前不叠加多个待读批次，单客户端不会阻塞runner。关闭清理定时器、订阅和缓冲。不是SSE恰好一次或生产容量承诺。

## 3. 最终验证（最后代码修正后重新执行）

最后产品修正为同场刷新保留有效快照/拒绝旧GET、Controller在StrictMode清理后重新激活。最终测试调整只将等待剩余完整动态讨论的断言期限设为15秒，仍按业务状态/13条记录断言，无固定sleep/自动重跑、不改变模型期限。最终整套执行时间为**20:27:34–20:31:11**，代码基线03a7f22加本轮测试工作树（随后提交a87d7ee）。此后只更新静态检查工具、文档及证据，没有产品修复。

完整命令、真实stdout/stderr、每项起止时间与退出码：[最终复验JSON](../evidence/stage-5c/verification-2026-09-16T12-27-34.962Z.json)。统一入口`node scripts/stage5c-verify.mjs`，内部直接调用项目已安装CLI，不安装依赖。

| 项目 | 实际命令（根目录） | 结果 | 退出码 |
|---|---|---|---|
| 后端单元 | npm test（包含下列集成） | 162通过 | 0 |
| SQLite/HTTP等集成 | npm test | 161通过，含8条SSE真实HTTP | 0 |
| 后端总计 | node node_modules/vitest/vitest.mjs run --config vitest.config.ts | 323通过，32文件，pending=0 | 0 |
| 前端 | npm run test:web | 87通过，11文件，pending=0 | 0 |
| 类型 | npm run typecheck；npm run typecheck:web；npm run typecheck:e2e | 3项通过 | 各0 |
| 构建 | npm run build；npm run build:web | 两端通过，前端30模块 | 各0 |
| 进程HTTP冒烟 | node scripts/http-smoke.mjs --lineup | 初始化重复安全，创建201/查询200/生成202/确认200/重开查询200，两个子进程退出0 | 0 |
| 浏览器 | npm run test:e2e | Edge独立上下文，原26+新11=37通过 | 0 |
| 静态安全/来源 | node scripts/stage5c-static-check.mjs；git diff --check | 历史Prompt前缀和保护范围不变；新Prompt真实；敏感形态0；私有配置忽略且未跟踪 | 各0 |

skip=0、only=0；Playwright forbidOnly=true、workers=1、retries=0；最终unexpected=0/flaky=0。警告：NO_COLOR被FORCE_COLOR覆盖，仅控制台颜色；Vitest建议关闭隔离可减少启动成本，但未采纳；Git既有LF/CRLF转换提醒，不改全局配置。未做依赖漏洞审计或宣称Win10获得官方支持。

### 浏览器11条新增用例

1. 真React/Express/SQLite003/SSE/Vite下，从创建到13条普通发言、中途观点、自然总结及刷新同run。
2. 同场两个观察者，另一个Tab开始可发现；刷新不增加Fake调用、开场只有一次。
3. 两场并行：首页加入、切换、运行刷新；停止A不影响B。
4. 离线时后台推进至终态，重连恢复13条唯一发言和总结，网络中断不冒充业务失败。
5. start/stop已执行但响应丢失，只发一次POST再GET；致命失败保留3条已提交内容。
6. 真实EventSource在发言事务半批处注入断线，不公开半批，随后完整恢复。
7. 用户向上阅读不被新发言拉走，点击新消息按钮才到底部。
8–10. 390×844/1专家、1366×768/4专家、2560×1080/8专家；长角色/发言/观点、窄屏切区、body边界、区域键盘焦点；8专家含实际分歧两立场。
11. 主动重复结束、可观察stopping、总结失败后completed+unavailable，原发言仍在。

正常路径没有API假成功。仅Provider测试组合注入门闩/长文/故障；响应丢失/半批/offline明确为传输故障。测试后端全局fetch拒绝外部网络。HTTP流测试使用真实SQLite与HTTP字节；背压单元用真实SQLite+受控Response，不能称为大规模慢网络验证。

## 4. 代表性RED→GREEN及真实修正

下表依据本轮真实终端输出汇总；早期逐步RED/GREEN未分别保存原始JSON，不补造历史文件。最终全量输出已持久保存。

| 本地时间 | 行为RED | 最小修正及GREEN |
|---|---|---|
| 19:49→19:51 | SSE HTTP期望200/非法400，实际均404，2失败 | 新增事件路由与持久化读取；同2测试通过，后扩展为8 |
| 19:53→19:54 | 开始事件未产生running快照，非法事件未拒绝，2失败 | 严格envelope+整批reducer；同2通过 |
| 19:56起 | start互斥/409查询恢复行为缺失，2失败 | 控制API与controller流程；同用例通过 |
| 19:58起 | 演播厅未呈现，向上阅读仍返回跟随true，2失败 | Studio及48px跟随判断；2通过 |
| 20:13起 | 同场重载把有效detail清为null | 保留已有detail并拒绝较旧GET；回归通过 |
| 20:16起 | dispose后再activate，start调用仍为0 | 显式activate，真实App开启StrictMode；回归通过 |

另有无效stream.reset向监听回调外抛Error，补受控有限恢复后3条stream测试通过。TypeScript类型/补丁上下文错误属于开发准备问题，不计业务RED。

真实E2E调试保留：

- 初次扩展场景1通过/8失败：配置在worker重新求值分配不同数据库，且失败用例未清运行槽；修正共享本轮测试库路径、afterEach受控结束本测试环境任务后10条通过。见initial-e2e-check.json。不是产品TDD RED。
- 首次全量36通过/1失败，见verification-2026-09-16T12-21-04.154Z.json：滚动用例7秒计数断言仍观察到3条；失败截图随后已经13条/正常总结。只读SQLite确认剩余发言已在12:24:09.584–12:24:11.092Z提交，终态12:24:11.113Z，浏览器轨迹12:24:17附近才追平。单独复现该用例退出0。没有证据把延迟归因于某个确定浏览器缺陷；保留此观察，不能宣称延迟性能已验证。
- 将整场完成等待限定为15秒、断言保持不变后，**重新跑整套9组验证**，37项全部通过，没有用自动重试掩盖失败。产品的30秒调用/60秒收尾期限未变。

## 5. 视觉检查与公开记录

最终截图位于`evidence/stage-5c/screenshots/`，已实际通过图像查看工具检查下列6张：

| 文件 | 审查结论 |
|---|---|
| desktop-running.png | 1366桌面三栏，已有3条发言及中途观点，真实状态标签和独立连接提示清晰 |
| narrow-studio.png | 390窄屏区域切换可见，长话题限高自身滚动，主操作可达，长身份/发言换行；截图已在内容底部，顶部发言被正常滚动裁出，不是数据缺失 |
| studio-8-experts.png | 2560宽屏9成员留在独立角色区，正文居中较宽，分歧两立场与来源可读，无横向溢出 |
| summary.png | 13条发言后独立总结；观点覆盖12条并明确第13条尚未纳入，没有假装全部覆盖 |
| summary-unavailable.png | 已结束与“总结生成失败”同时明确，不显示虚构总结 |
| disconnected.png | 业务仍运行，连接中断单独提示，旧内容保留并有重新连接入口 |

stopping.png、studio-4-experts.png及旧流程截图也保存；未将每张保存图都宣称逐张人工审查。截图是Fake测试输入，可见[text]/[long]/[run:...]等门闩标记，不是正式样例或真实模型记录。没有外部头像/字体/装饰动画。尚未验证移动真机软键盘、屏幕阅读器全套可访问性或所有文本长度组合。

最终完整主流程只读留证：[final-fake-snapshot.json](../evidence/stage-5c/final-fake-snapshot.json)。discussion=`34fea1c3-05a3-4697-9428-522562c6efb5`，run=`051c39c1-8985-4f9c-8dfa-d2829810b09c`，completed/summary.ready、13条公开发言、73次Fake调用；不是付费请求或真实usage。

## 6. 资源、数据及Git

E2E使用本轮新建`.tmp/stage-5c/browser-*`、41861/41862，不复用未知服务；HTTP旧回归脚本在`.tmp/stage-4b/smoke-*`新建独立文件，目录名沿用脚本但不是历史验收库。无用户库迁移/清空，001/002/003与旧4D/5B证据未变。

Windows下Playwright结束进程树后，6个本轮自建实例留下数据库`.owner`文件：这是单库进程占用标记，不是运行槽。核实PID均已退出、绝对路径均在本轮stage-5c范围，再仅删除对应6个owner文件，保留数据库和记录；没有结束其他进程、清未知锁或增加自动抢占。明细与无监听结果见[resources.json](../evidence/stage-5c/resources.json)。测试上下文随Playwright退出，HTTP/SSE测试关闭自有连接/数据库，心跳/背压单元验证定时器归零。41861/41862最终无监听。

实际提交：8fc5b82（SSE）、03a7f22（消费与演播厅）、a87d7ee（E2E与验证工具）；本报告/截图/契约/开发记录单独收尾提交。只暂存明确范围，不提交私有配置、SQLite、原始trace或node_modules。source-and-scope.json保存代码哈希、历史Prompt原文保护和静态检查；后续文档提交不修改被验收代码。

本轮完成 Fake Provider 下的核心用户流程 E2E，未调用真实讨论模型，不代表真实讨论质量、完整产品全部要求或生产负载已经验证。

停止于5C；真实讨论适配、单独预算授权/质量审查、完整交付样例及工作流材料仍需后续独立任务。未进入任何真实讨论调用。
