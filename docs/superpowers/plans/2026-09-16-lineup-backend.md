# 阶段4B阵容后端实施计划

> For agentic workers: 使用现有superpowers:executing-plans在当前会话逐任务执行。用户明确禁止未授权代理/worktree，不使用默认子代理流程；本轮已明确授权当前仓库提交。

**Goal:** 将已确认4A设计实现为可迁移、可查询、可生成/确认的Fake阵容后端，并保持草稿界面兼容。

**Architecture:** node:sqlite迁移和repository负责原子持久化，领域校验与generation service不依赖供应商。Fake只替换外部生成边界，所有成功/失败输出通过同一校验和CAS；HTTP及前端仅公开白名单。

**Tech Stack:** 既有Node24/Express5/TypeScript7/SQLite/Vitest5/React19/Playwright1.63，精确锁文件保持，不增加依赖。

## 全局约束

根目录D:\实测文件夹。只4B，无真实模型/密钥、调度、SSE或阵容卡片/按钮。每generation最多两次Provider调用，单次30秒、总期60秒；失败和迟到不能使旧阵容恢复可确认。旧草稿19字段兼容。每个核心任务先可运行骨架、业务RED、最小实现GREEN、整理后回归；准备错误不算RED。每次提交前核对测试、暂存范围、敏感形态和历史Prompt前缀。只临时库升级，不删库。

## A. migration框架与严格001接管

文件：新增src/db/migrations.ts、src/db/schema-v1.ts；tests/fixtures/schema-v1.sql（冻结真实旧DDL）、tests/integration/migrations.test.ts。

接口：migrateDatabase(db: DatabaseSync, target?: 1|2): void；assertCurrentSchema(db): void。target是显式迁移目标，生产db:init默认最新；001只有原两表，迁移元数据不改变业务。

- [x] 写旧fixture建库/插行/未知约束/重开/幂等测试。代表断言：`migrateDatabase(db, 1); expect(db.prepare('SELECT id FROM schema_migrations').all()).toEqual([{id:1}]);`。
- [x] 骨架只抛“MIGRATION_NOT_IMPLEMENTED”，运行`npm test -- tests/integration/migrations.test.ts`记录业务RED。
- [x] 实现事务、schema结构指纹、001登记/checksum、失败rollback、外键恢复。精确旧行/事件不改；不匹配即SCHEMA_MISMATCH。
- [x] 同一文件GREEN，`npm test`回归，检查范围后提交001。整理重复schema检查时再次运行同组。

## B. 002 lineup schema与初始化入口

文件：新增src/db/schema-v2.ts；修改src/db/migrations.ts、database.ts、runtime.ts、init-db.ts；扩展migrations.test.ts和schema.test.ts；新增tests/integration/runtime.test.ts。

接口：initializeDatabase(db)迁移到最新；openConfiguredDatabase(path, initialize=false)启动只检查，初始化显式迁移。schema-v2导出固定SQL，migrations控制事务。新增字段与lineup_members严格遵循lineup-design，成员表仅保留最后成功整组，历史成功在公开事件留存。

- [x] 从001 fixture迁移写RED：`expect(tableNames).toContain('lineup_members')`；注入002记录写失败要求整事务回滚；约束实插、旧字段字节/事件、重开、重复迁移都验证。
- [x] `npm test -- tests/integration/migrations.test.ts tests/integration/runtime.test.ts`；只行为未实现失败计RED。
- [x] 新表复制/原子替换Discussion，检查FK/integrity；启动不隐式迁移；维护入口对已有文件新建一致备份且不覆盖。
- [x] 同组GREEN，原79后端回归（表数量断言按新增schema明确更新），类型检查后提交002。

## C. lineup领域和运行时验证

文件：新增src/domain/lineup.ts、src/domain/snapshot.ts；修改src/domain/errors.ts、drafts.ts；测试tests/unit/lineup.test.ts。

接口：parseRoster(raw: unknown, expertCount: number): CandidateMember[]；enrichRoster(candidates): LineupMember[]；validateGenerate(input): {requestId,expectedGenerationId}；validateConfirm(input): {generationId,lineupRevision}。snapshot类型为旧created与新增四态联合，成员八公开字段。

- [x] RED验证`parseRoster(valid,4)`结果及少/多专家、空/重复/系统字段、非法role、UTF边界、错误分类、系统顺序颜色。
- [x] `npm test -- tests/unit/lineup.test.ts`；先运行抛未实现的校验骨架。
- [x] 实现parse→结构→业务→trim→系统补字段；分类LINEUP_INVALID_STRUCTURE/MEMBERS；安全notice枚举和纯公开快照校验。
- [x] 同组GREEN，类型检查和旧输入测试回归；整理后复验。

## D. FakeRosterProvider

文件：新增src/providers/roster.ts、fake-roster.ts；tests/unit/fake-roster.test.ts。

接口：RosterGenerator.generateRoster(input:{discussionId,topic,expertCount,constraints}, context:{signal,deadline,repairIssues?}): Promise<string>；Fake构造时注入模式序列或受控响应函数，默认正常候选，绝不网络访问。

- [x] 先以生产parseRoster验证Fake正常与所有异常模式，断言`expect(parseRoster(await fake.generateRoster(input,context),4)).toHaveLength(5)`；屏障控制迟到，无固定sleep。
- [x] 骨架RED，实现确定性候选/错误/等待/忽略取消的可控边界，再运行同组GREEN。
- [x] `npm test -- tests/unit/lineup.test.ts tests/unit/fake-roster.test.ts`回归并提交领域/provider。

公开snapshot类型和校验随E/H真实消费者接入，避免无调用方实现。C已完成候选及HTTP输入校验。

## E. generation service、存储与恢复

文件：新增src/domain/lineup-service.ts、src/db/sqlite-lineup.ts；修改sqlite-drafts.ts、drafts.ts使读取公开快照兼容；测试tests/integration/generation.test.ts、tests/unit/generation.test.ts。

接口：LineupStore.read(id)、begin(id,input,generationId,time)、complete(id,generation,members,time)、fail(id,generation,code,time)、recover(time)、confirm(id,input,time)。LineupService.generate(id,body)同步返回受理/重放；异步运行Provider；close()取消自有任务并等待本地终结，供服务关停使用；assertAvailable(id?)屏蔽不可持久化状态。

- [x] RED：真实DB的created→generating→ready、重试预算/分类、容量、无事务等待、regen失败旧成员留库但GET为空、A迟到/B有效、成员及事件故障回滚、恢复中断。
- [x] 每一组先运行`npm test -- tests/integration/generation.test.ts tests/unit/generation.test.ts`确认业务RED再最小实现；不一次实现后补测试。
- [x] repository短事务CAS、公开状态事件原子写入；service保持当前任务/取消/两次总预算/单调总期限/故障标记，Fake不绕过校验；无通用队列。
- [x] 同组GREEN，`npm test`回归；真实事务/故障测试与unit分别标明；提交generation。

## F. confirm service

文件：补齐sqlite-lineup.ts/lineup-service.ts；tests/integration/confirm.test.ts。

输入：当前generationId+lineupRevision；输出{discussionId,snapshot,replayed}。正确ready→confirmed；旧版本/失败/生成中409；同版重复200且时间/事件不变。

- [x] 先用真实ready记录写RED：确认后status=confirmed，startedAt=null、utterances=[]、synthesis=null；竞态确认/regen只有一个成功。
- [x] `npm test -- tests/integration/confirm.test.ts`看到未实现失败，再实现事务核对双版本及状态。
- [x] 同组GREEN及generation回归；与G一起形成实际完整提交。

## G. HTTP、启动与安全错误

文件：修改src/http/app.ts、server.ts；新增tests/integration/lineup-http.test.ts；现有草稿HTTP回归保留。

接口：createApp保留原草稿调用方式，可注入LineupService；新增/lineup及/lineup/confirm路由；GET和创建重放返回当前快照。生产入口显式使用Fake并说明不是AI；恢复遗留生成在监听前完成。

- [x] 真实Express+SQLite+Fake先RED：202/200/400/404/409/429/503、跨站拒绝、异步失败GET200、安全字段；未挂路由时404是有效路由RED。
- [x] 添加最小路由、同源JSON保护及分类错误；绝不返回原始provider/SQL/堆栈。
- [x] `npm test -- tests/integration/lineup-http.test.ts tests/integration/http.test.ts tests/integration/confirm.test.ts` GREEN，再全后端回归/类型检查，提交confirm+HTTP。

## H. 最小前端消费者兼容

文件：修改web/src/api.ts、App.tsx；新增web/tests/lineup.test.ts；保留controller行为和旧测试。

接口：decodeSnapshot接受精确联合DTO，create/list/get仍原路径；新中文状态标签，created不变，不增加生成/确认按钮、卡片或轮询。

- [ ] 先RED：五态snapshot、未知字段/旧成员泄漏/坏确认版本拒绝；创建幂等重放可接受已生成快照；active合法列表不再错误拒绝。
- [ ] `npm run test:web`确认新行为失败；补齐严格校验和通用状态文本，GREEN。
- [ ] `npm run typecheck:web`、`npm run build:web`及阶段3原9项E2E回归通过后提交兼容。

## I. 回归、证据、文档与停止

文件：docs/stage-4b-validation.md、contracts/architecture/test-plan/development-log及README；evidence/stage-4b命令JSON；scripts范围/来源检查；playwright配置仅调整测试初始化和本轮输出位置，原测试逻辑保持。

- [ ] 最终`npm run typecheck`、`npm run typecheck:web`、`npm run typecheck:e2e`、`npm test`、`npm run test:web`、`npm run build`、`npm run build:web`、`npm run test:e2e`，独立库启动真实HTTP冒烟。
- [ ] S4-01–31映射真实测试，4C UI和S4-32真实模型保持未执行；不可将未来检查凑成通过数量。
- [ ] 检查源码/锁文件/Prompt前缀、实际Git署名/暂存无数据库密钥或临时包，关闭自有服务；按事实提交文档与证据。
- [ ] 报告退出码、RED→GREEN、迁移范围、旧阵容不可确认、Fake局限；到4B停止。

## 计划自检与执行方式

各任务路径/输入输出明确；001只原schema，002才阵容；共用重试预算、旧版本失效、事务/事件、公开DTO、前端严格解析均有对应任务。无占位项，无真实模型或完整UX。按用户授权当前会话顺序执行，不另问实施授权，不启动子代理/worktree或分支清理。任务复验结果与实际偏差记录到单一stage-4b-validation。
