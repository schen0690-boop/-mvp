# 阶段3：中文草稿首页与详情验证记录

日期：2026-09-15，项目D:\实测文件夹。实际使用Codex，DDD沿用题面的“前端组件与页面”，本轮包含交互逻辑TDD和局部E2E，不等同整套产品E2E。授权原文P4及暂定Git身份见sources/development-prompts.md；阶段0原报告未改。

## 交付与边界

首页可输入话题和1–8位专家（默认4，不含主持人），创建草稿、切换进行中/全部讨论、选中详情、刷新后从全部列表重新读取。保存内容均来自真实SQLite。草稿只显示已保存及阵容尚未生成，不生成主持人、专家、发言、共识或模型任务。

主要新增web/src/{App.tsx,api.ts,controller.ts,main.tsx,styles.css}、web/index.html、web配置与测试；e2e三份持久化测试、playwright.config.ts和tsconfig.e2e.json。根package/锁文件、记录脚本、README、AGENTS及现有需求/架构/契约/UI/测试/开发记录局部更新。src/、tests/与tools/env-probe/保持阶段2基线内容。

单一蓝色中文工作台、系统中文字体；桌面三区、窄屏切换三区，正文分区滚动。列表长话题最多三行，详情完整换行显示；不使用外部字体、图片、假进度或装饰动画。错误和加载状态有可见文案，表单具备标签、键盘焦点和提交禁用。

请求层只显示经过校验的公开响应，HTML话题按React文本显示，错误按状态映射固定中文文案。输入共享浏览器安全的运行时校验；服务端领域类型仅type导入。未引入SQLite/Express/密钥配置到浏览器。

## 安装与Skills实际使用

正式根目录执行npm install --ignore-scripts --no-audit --no-fund，新增9个包，退出0（01-install）。React/react-dom及类型包19.3.0，@playwright/test 1.63.0；其他正式精确版本保持1B已验证路线。实际解析均来自根node_modules；证据21-dependencies记录版本、路径、Node与SQLite。未运行远程安装脚本、下载浏览器、安装其他Skill或变更全局配置。

| Skill | 路径/来源 | 文件存在、已读、已用 | 执行验证边界 |
|---|---|---|---|
| frontend-design | D:\实测文件夹\.agents\skills\frontend-design\SKILL.md；anthropics/skills commit 34040c9c568585f6929bedeaad110ad08f079624 | 是；显式读取并用于布局/字体/状态设计 | 上游目录仅SKILL.md/LICENSE.txt，原字节保留；无scripts/references或执行依赖；不是安装即自动发现，自动发现未验证 |
| brainstorming | C:\Users\Administrator\.codex\skills\superpowers\skills\brainstorming\SKILL.md | 是；依据已有设计及本轮授权梳理局部布局 | 不重复请求整项目设计批准；未启动自动实施、worktree或代理 |
| test-driven-development | 同Superpowers根目录test-driven-development\SKILL.md | 是；用于API适配/交互控制的RED→GREEN | 执行本项目Vitest及浏览器测试，不是Skill自带脚本 |
| systematic-debugging | 同Superpowers根目录systematic-debugging\SKILL.md | 前阶段完整读取，本轮复读开头；用于编码/定位器/布局问题 | 真实失败和修复如下 |
| verification-before-completion | 同Superpowers根目录verification-before-completion\SKILL.md | 是；结束前完整复读并用于验证 | 命令、退出码与截图已实际检查 |
| skill-installer | C:\Users\Administrator\.codex\skills\.system\skill-installer\SKILL.md | 已读，用于安装边界审查；检查辅助脚本开头 | 未执行安装辅助脚本；仅下载固定commit的两个静态文件，手工项目级存放 |

frontend-design原URL与两文件SHA-256在evidence/stage-3/frontend-design-source.json。Apache-2.0许可证原文随Skill保留。Skill开头提到客户拒绝旧稿，是上游通用语境，不是本项目发生的事实。Superpowers可得历史版本6.1.0、commit f268f7c953744036f0fa7e9d4b73535c04e57cb8沿用阶段0记录，本轮未重新核实版本或升级；不虚构插件接口调用。

## 真实RED→GREEN

完整命令、时间、stdout/stderr及当时源码哈希保存在evidence/stage-3/*.json。失败记录不删除，也不把准备错误当业务RED。

| 行为 | RED证据/退出码 | GREEN证据/退出码 |
|---|---|---|
| 输入转换、公开响应校验与200/201处理 | 02-api-red：11项中5项业务断言失败，退出1；其余非法输入在抛错骨架下已满足，不宣称全部先红 | 03-api-green：11项通过，退出0 |
| 重入、不可变重试ID、列表失败与查询代次 | 04c-interaction-clean-red：7项业务断言失败，退出1，无未处理拒绝 | 05-interaction-green：前端合计18项通过，退出0 |
| 实际页面创建/列表/详情 | 06-page-red：页面仍为待实现占位，找不到业务输入，退出1 | 08-page-green：真实浏览器流程1项通过，退出0 |
| 桌面初始主操作完整可见 | 12-primary-visible-red：1366×768按钮可见比例0.388852，预期1，退出1 | 13-primary-visible-green：三个尺寸均通过，退出0 |

真实修正：准备fixtures时Python默认GBK读取UTF-8失败，04-interaction-red缺少文件不算业务RED；修正编码/补齐文件后重跑。04b出现未消费的受控Promise拒绝，测试辅助添加旁路catch吸收未处理诊断，原Promise仍保留拒绝供实际调用者处理，04c取得干净业务RED。09-browser-extended有8过1失败，原因是窄屏隐藏列表后测试仍按可见region定位；按窄屏切换语义修正定位，并增加切回后滚动位置断言。截图发现普通桌面主按钮被挤压，先加可见比例断言复现，再压缩普通桌面输入框；长话题列表增加三行摘要，详情保留全文。

## 最终实际验证

| 命令（项目根目录） | 结果 | 退出码 | 证据JSON |
|---|---|---|---|
| npm run typecheck | 正式后端及测试类型检查通过 | 0 | 15-backend-typecheck |
| npm run typecheck:web | 前端源码/单元/配置类型检查通过 | 0 | 16-web-typecheck |
| npm run typecheck:e2e | 浏览器测试及配置严格类型检查通过 | 0 | 17-e2e-typecheck |
| npm test | 79项后端回归（38单元、41集成）通过 | 0 | 18-backend-regression |
| npm run test:web | 18项前端单元通过 | 0 | 19-web-regression |
| npm run build | 正式后端编译通过 | 0 | 20-backend-build |
| npm run build:web | Vite生产构建通过，20模块 | 0 | 14-web-build |
| node scripts/check-dependencies.mjs | 精确版本、根安装路径与锁文件一致 | 0 | 21-dependencies |
| npm run test:e2e | 9项局部Edge浏览器测试通过 | 0 | 22-browser-final |
| python scripts/check-stage3.py | 历史前缀/Prompt、50份探针、后端与上游Skill哈希、文档及候选敏感形态检查通过 | 0 | 24-source-and-scope |

来源检查初次23-source-and-scope退出1，定位为附件读取时统一LF，而归档保留CRLF；只修检查器比较时的换行归一化，未改历史归档。旧前缀仍按原始字节SHA-256检查，本轮Prompt按文字与换行归一化核对。检查只覆盖可版本化文件的高置信度敏感形态，不是完整安全审计；未读取密钥配置。

浏览器9项包括3项正常业务、3项明确标记的网络故障注入、3项布局；均使用真实前端/Express/SQLite。后端已保存但响应丢失后，真实POST重放200且只有一条记录；创建成功后列表500保留已保存详情并可仅重载列表；旧详情响应不覆盖新选择。前端单元补充旧错误/finally、409及修改输入的ID边界。不是完整运行讨论测试，未混入环境探针测试。

浏览器启动新建独立SQLite和回环41841/41842，不复用已有服务；Edge独立非持久化上下文，不使用个人资料。测试结束已检查这两个端口无监听。原始临时报告/trace忽略；完整历次失败命令输出保留，不能声称每次重跑前的浏览器trace也全部保留。NO_COLOR/FORCE_COLOR警告不影响退出码与断言。

## 截图检查

实际文件均位于evidence/stage-3/screenshots/：

- 390x844-create.png、390x844-detail.png：窄屏三区入口、输入/详情可读、滚动容器。
- 1366x768-normal.png：正常创建/列表/详情；1366x768-list-error.png：保存成功与列表失败分别表达。
- 1366x768-detail.png、2560x1080-detail.png：长话题换行、桌面三区和独立滚动。

六张截图均已通过view_image目视检查：没有正文重叠或页面横向溢出；列表长标题有意截成三行、详情可读全文。普通桌面初始创建主按钮完整可见；保存/错误提示出现后容器内容增加，创建区允许独立滚动，当前恢复操作“重新加载列表”在区头可见。键盘表单焦点与区域访问由浏览器断言验证。未宣称真实移动设备、屏幕阅读器或所有浏览器都通过。

## Git与尚未执行

用户提供暂定schen / cs064210@163.com后，仅配置当前仓库。65e24f5在2026-09-15T19:55:53+08:00建立截至阶段2的真实基线；此前阶段没有提交，不倒填为过去已提交。基线检查发现两处旧文件末尾空行（ui-spec及探针README），保留原状；后续按本轮实际改动提交，不重写历史。阶段3界面与持久化测试提交为b2d830d（feat: add Chinese draft workspace with request lifecycle tests）；后续文档证据提交以git log及本轮回复为准。

尚未执行：真实模型、阵容生成/确认/开始、专家调度、SSE与重连、共识及总结、完整产品E2E、生产部署、npm漏洞审计、受官方支持OS验证。Windows10与node:sqlite支持风险沿用1B，不能由本次成功消除。题面工具口径仍待出题方确认；测试草稿不是5组话题+阵容样例。

下一阶段最小建议：先确认应用模型协议所需能力，再对阵容生成的可控模型边界和旧草稿库非破坏迁移开展TDD；本轮到此停止，不提前实施。
