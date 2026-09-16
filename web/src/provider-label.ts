// Display-only test composition label; this never selects or authorizes a Provider.
export function providerLabel(){return import.meta.env.VITE_DISCUSSION_DEMO==='live-short'?'阵容为本地预置；后续讨论内容由真实模型生成。':import.meta.env.VITE_DISCUSSION_DEMO==='local-http'?'真实适配器经本地 HTTP 替身验证':'Fake 演示 · 非真实模型';}
