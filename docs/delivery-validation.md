# 阶段7交付核对与干净目录复现

## 范围与判定方式

只核对原题前三部分。题面原图本轮再次目视读取，第三部分仓库链接要求保留，第四部分提交方式不纳入。唯一逐项检查表为[requirements](requirements.md)，不另造需求体系。本报告区分本地自动化、历史真实单样本、人工检查和未验证事项。阶段7官方模型请求必须且实际保持0，旧4D/6B/R1授权关闭不变。

当前候选修补已完成；干净目录最终结果将在本报告末尾追加。源码候选与实测命令以追加证据为准，不把本段写成已经复现成功。

## 交付材料与必要修补

- 源码与初始化：src、web、001/002/003，正式依赖根package/lock；没有新schema、ORM、讨论调度改写。
- 五组样例：src/sample-data.ts（教育/公共空间/工作制度/数字展览/食物减废，2/3/2/3/4专家+各一主持），全员虚构、职业/Title/立场不同。import-samples统一验证和系统赋值，整批事务；seed离线CLI锁库，重复幂等不覆盖、不自动确认/运行。复用DraftStore事务helper以支持整批原子导入，既有草稿语义不变。
- 普通入口：app-providers分开选择阵容/讨论，默认Fake；deepseek须有效后端环境配置与显式--allow-real-models。不读取私有文件自动启用；不静默回退。/api/config只报告两种名称，页面据此显示模式，失败显示未知。工厂接正式runner经本地HTTP替身验证，不请求官方。
- 启动清理：普通server补自有IPC shutdown，与已测试启动器配合释放.owner；Ctrl+C原入口保留。无新通用启动框架。
- 当前文档：README准确入口/命令、architecture当前ER/状态/时序、contracts清除已被替代SSE草案并补模式查询、requirements逐行证据、test-plan历史与当前区分、ui-spec模式说明。
- 开发过程：sources原始Prompt保持，追加P17与精选索引；workflow.md说明实际Codex/Skills、三真实问题与工程认识。Edge按A4/20mm/14px/1.65简易Markdown版式预览，连续高度约1.081页，非所有渲染器精确分页保证，见workflow-layout.json。

## 真实TDD及本轮问题

| 行为 | 实际RED | 修正与定向GREEN |
|---|---|---|
| 五组样例/重复/写失败 | 返回0组、记录数不符、未抛写失败，3失败 | 既有校验+系统赋值+统一事务，3通过；草稿/列表回归 |
| 普通Provider选择 | 显式真实仍Fake、未拒绝未授权配置，2失败 | 分别解析配置并检查CLI开关，3项通过；构造不发送 |
| 公开模式HTTP | /api/config为404 | 白名单两字段，HTTP回归通过 |
| 模式文案 | 给真实模式仍返回Fake标签 | 接后端公开配置，混合模式明确显示 |
| 后端自有退出 | shutdown消息后超时仍未退出 | IPC退出处理，退出0且owner释放 |
| Host安全边界 | 非本机Host GET返回200 | 拒绝非loopback Host，400且现有HTTP回归通过 |

原始RED/GREEN JSON在evidence/stage-7。首次交付冒烟脚本遗漏Playwright baseURL，查询抛Invalid URL；这是脚本准备错误，不记业务RED。清理同时揭示普通server缺IPC路径，用独立测试复现再修。只清理该次已退出测试PID的owner，保留测试库。之后独立新测试库冒烟通过。文档替换曾因CRLF匹配误删测试计划片段，提交前diff发现并从HEAD恢复后仅更新目标段，未改历史Prompt。

## 安全专项审查

使用来源（只读取，不安装、执行远程脚本或复制整份参考）：

- [OpenAI security-best-practices](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-best-practices)，固定49f948f；读取SKILL、React/Express/general-web前端参考、Apache-2.0 LICENSE.txt。临时文件在.cache/delivery-skills，来源清单见evidence/stage-7/skills.json。
- [Vercel web-design-guidelines](https://github.com/vercel-labs/agent-skills/blob/063bee94c3f4df8453406c830b0a7df0f2860278/skills/web-design-guidelines/SKILL.md)，固定063bee9；其[界面规则](https://github.com/vercel-labs/web-interface-guidelines/blob/e3d624baaf29dc1fc645aff3e38f03e564d2d6b1/command.md)固定e3d624b。所查agent-skills树中未取得该Skill独立许可证，标为未验证；不分发/安装Skill文件。

| 编号/等级 | 位置与证据 | 处理/限制 |
|---|---|---|
| S01 中等，已修复 | src/http/app.ts，原GET未限制Host，可构造外部域Host读取 | loopback Host白名单；HTTP先RED后GREEN。POST仍有JSON/Origin检查；只限本机可信使用，不宣称公网安全 |
| S02 交付安全接线，已修复 | src/server.ts、app-providers.ts | 默认Fake，显式选择加CLI开关；失败不回退；前端不得改地址/预算/故障模式 |
| S03 扫描无凭据形态命中 | scripts/delivery-security-scan.mjs，已跟踪文件及所有历史文本blob | 只输出位置/类型，无密钥原值；未读取私有配置正文；图片另人工抽查。模式扫描不能排除所有泄漏 |
| S04 已有边界检查 | domain/discussion/lineup、db复合关联、public-events、http/events | 引用同场验证、参数绑定、公开字段白名单；SSE64事件/256KiB/10秒背压、15秒心跳及连接清理测试 |
| S05 人工代码审阅 | web/src JSX、deepseek-transport | 不用dangerouslySetInnerHTML/eval，topic/正文按文本；推理字段不进入DTO，诊断白名单，不保存原响应。前端产物另扫后端配置符号 |
| S06 尚未覆盖 | 本地Vite/Express无公网部署/账户方案，列表无分页，CSP等生产加固未专项实施 | 不扩展部署功能；仅回环可信环境。依赖漏洞数据库、渗透测试和完整供应链审计未执行 |

测试与交付验证显式清除继承模型配置，子进程fetch守卫拒绝非本机；替身只在模型边界映射loopback。旧42个保护文件哈希保持（含R1九次原计数），不创建新真实授权。静态审查与白名单不是语义安全的完整证明。

## 界面与非空观点审查

既有e2e/runtime实际测试1/4/8位专家，390×844、1366×768、2560×1080，长话题/发言/观点、独立滚动、键盘焦点、空态、错误/断线/总结不可用。新样例可在首页查看，未重做样式。当前运行模式准确性通过HTTP、文案及正式入口浏览器核对。

低优先级待改进（不阻断当前作业主流程）：web/src/App.tsx缺跳至主内容链接，表单可进一步补name/autocomplete与错误后焦点定位；列表大量历史记录未做虚拟化。现有label、原生button、focus-visible、文本状态和各区滚动可用。没有声称全套WCAG或屏幕阅读器/移动真机认证。

已有非空测试足够覆盖本地结构：unit/discussion两专家共识与两立场分歧、非法/跨场引用；discussion-store真实证据表、旧来源拒绝；Fake E2E与HTTP替身页面中途非空观点、更新和证据跳转。无需重复造新夹具；这些不等同真实模型语义证据支持。

## 历史真实内容复查

原6B受阻0请求、P15本地启动修复、R1新独立授权成功保持分开。R1阵容预置、两次专家发言、一次合法空提炼、九次真实请求；没有验证真实非空共识/分歧质量。

读取R1公开原文：周衡第二条说“只在小范围试点中见到反馈效率提升”；陈思敏第三条也说“现有证据多来自小范围试点”，并建议以教师负担/反馈指标做对照。总结中的“当前证据多来自小范围试点”是对两条专家原话的概括，**不是主持人凭空新增该试点判断**；但专家原话没有提供研究来源，因此不能把该概括当作已验证外部事实。总结“均指出…公平与可评估效果”把两人侧重压缩归并，不能证明每人分别明确赞同每个分句。原输出保留，没有补外部来源、改输出或再调用改善。

## 图与外部待办

当前architecture三图、discussion-runtime-design及lineup-design现行图按代码人工核对；本机未找到项目mermaid/mmdc，未安装渲染器，**Mermaid渲染未验证**。历史设计图不作为执行证据。

第三部分远程GitHub/Gitee链接尚缺（git remote为空）；本轮不创建或推送。Codex与题面工具口径仍待出题方确认，不能签署或虚构许可。实际开发模型未核实；应用运行模型明确deepseek-flash。跨平台、移动真机、长期/多题质量与生产负载均未验证。
