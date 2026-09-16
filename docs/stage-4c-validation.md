# 阶段4C：实施与验证记录

## 本轮范围与执行清单

1. API命令：真实路径/版本校验、受控错误；输入输出为现有4B DTO。测试先RED再实现。
2. Controller：生成/重试/确认、同步busy保护、409刷新、旧响应隔离；输出UI状态。独立单元验证。
3. 轮询：2秒串行、60次上限、离线暂停/恢复、离开取消；URL仅保存discussion ID。独立假时钟测试。
4. LineupPanel/App/CSS：五态和响应式卡片，保留三区滚动；呈现测试及真实浏览器验证。
5. E2E：临时SQLite、正式服务组合、仅Provider注入；异常网络测试单独标记；原回归全部运行。
6. 最终类型/构建/回归、截图审查、来源保护与Git检查。未运行前不记通过。

## 界面设计与自检

沿用背景#edf1f6、白面板#ffffff、正文#253449、次要文字#5c6b7e、深蓝#193455、主操作#2157a5；微软雅黑、本地字体，正文14px，标题层级沿用原页面。左对齐：话题/元信息 → 当前状态与操作 → 主持人 → 专家网格。主持人独立一行；专家按可用宽度自动1–3列，窄屏单列；每个成员只以服务端颜色小标记辅助文字身份。没有头像、外部字体、动画或新的全页布局。

审查：本轮是讨论准备，不使用营销hero和假Agent状态；保留原三栏与窄屏标签。URL查询参数discussion只定位，不保存阵容。已有生成请求未知结果时保留同一requestId重试；真正失败重试/重新生成受理后换新请求ID。

## 证据

所有历史阶段报告保留原语境。以下为本轮实际记录。

### 真实RED→GREEN及修正

- api-red：7项因命令骨架“尚未实现”失败，退出1；api-green含原回归32项通过，退出0。
- controller-red：23项中15项因未提交/无轮询/无状态推进失败，退出1；首次green有1失败：夹具的重新生成version=2低于已有ready version=3，防回退正确拒绝。修正夹具后55项通过，未放宽版本保护。
- panel-red是配置尚未包含tsx导致未发现测试，不计业务RED。修正include后panel-business-red有8项因空组件缺少状态/卡片失败；panel-green共63项通过。
- uncertain-post-red：POST结果不明后GET证实失败，再重试仍使用旧ID，1项失败；修复在GET证明新代受理后释放旧命令身份，66项通过。
- monitor-boundary-red：离线恢复绕过隐藏/上限、409后的GET失败仍可确认旧卡片，2项失败；修复预算/可见性与needsRefresh防护，68项通过。
- 准备差错：一次Python未显式UTF-8读取导致编码错误，未修改目标；一次strict TS发现可选signal=undefined不符RequestInit，改为null。均不计业务RED。

### 最终验证

| 根目录命令 | 数量/结果 | 退出码 | evidence/stage-4c |
|---|---|---|---|
| npm run typecheck | 后端严格类型通过 | 0 | final-backend-types.json |
| npm run typecheck:web | 前端严格类型通过 | 0 | final-frontend-types.json |
| npm run typecheck:e2e | Playwright配置/测试类型通过 | 0 | final-e2e-types.json |
| npm run build | 后端编译通过 | 0 | final-backend-build.json |
| npm run build:web | 23模块正式构建通过 | 0 | final-frontend-build.json |
| npm test | 190＝99单元＋91集成，含29 HTTP与12迁移（不重复相加） | 0 | final-backend-tests.json |
| npm run test:web | 68＝原25＋新增43 | 0 | final-frontend-tests.json |
| npm run test:e2e | 26＝原10＋新增16，Edge/真实服务/新临时SQLite | 0 | final-e2e.json |

记录器直接调用项目内对应入口，等价package.json脚本。首轮E2E25项通过；补充真实请求等待按钮禁用及最终截图后，最终26项全部通过，无skip/only、无重试通过。唯一浏览器warning为既有NO_COLOR被FORCE_COLOR覆盖；Vitest另有worker复用性能建议，未改测试隔离。未安装软件、依赖、浏览器或Skills。

### 界面实看与范围

已实际打开最终PNG：desktop-4-members、lineup-1366-8-bottom、lineup-390-1-bottom、confirmed、failed；首轮还查看desktop-4、lineup-1366-8、lineup-390-1、lineup-2560-8。主色与原三栏一致；主持人独立且专家按可用宽度排列；字段和立场完整换行；8位专家在详情容器滚动，body未扩展；窄屏保持区域标签与键盘焦点。截图在evidence/stage-4c/screenshots。普通屏不能同时显示所有卡片，滚动至后续成员即可；未为了截图压缩正文。

URL保留discussion ID，刷新GET恢复五态，无阵容localStorage。2秒串行60次上限；联网恢复计入剩余预算，离线/隐藏不持续查询；超过上限仍为generating并提供手动检查。409取新快照但不自动确认，获取失败锁旧操作；普通确认失败保留卡片。多Tab以服务端为准，迟到响应不能覆盖当前讨论。

### 交付限制与下一步

生产后端src/、001/002、package/锁文件未改；没有数据库迁移变更。测试入口初始化自己新建的临时库，不读取模型Key或用户库。阶段4C仍使用Fake Provider，未接入或验证真实模型；没有调度、SSE、发言、共识、总结、完整演播厅/系统E2E、移动真机或模型质量评审。

4D建议在单独授权后确认供应商协议/模型标识及安全配置方式，先适配器TDD，再最小真实阵容调用、结构/取消/超时与错误分类检查；不预设价格/额度，不要求在聊天中提供密钥。本轮停止在4C。

### 收尾检查与Git

scripts/check-stage4c.mjs实际退出0（final-scope-check.json）：历史Prompt前缀字节/哈希不变、P7与附件原文一致；生产src/tests、依赖锁、探针、阶段2/3/4B证据、旧验证报告与项目Skill对c4bf7f4无差异；所检查敏感形态0命中，无skip/only；8个最终命令退出0且记录的源码哈希与当前文件一致。E2E报告26 expected、0 unexpected/skipped/flaky；17张PNG。实际检查41841/41842已无监听；未关闭用户5173服务。Git diff --check退出0，仅原有换行转换提示。

实际提交按小任务：965b639 API运行时校验；4b05472 操作与轮询；7421649 五态卡片与URL恢复；957ae40 未知POST/冲突与恢复边界修复；随后E2E和文档验证各自提交。每次检查暂存范围，未提交DB/.env/trace原始目录，未改写历史。提交时间均为实际当前时间。
