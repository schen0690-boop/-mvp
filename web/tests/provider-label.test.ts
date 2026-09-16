import {afterEach,expect,it,vi} from 'vitest';
import {providerLabel} from '../src/provider-label.js';
afterEach(()=>vi.unstubAllEnvs());
it('默认仍为Fake；本地HTTP接入明确标签且不读取密钥',()=>{
 expect(providerLabel()).toBe('Fake 演示 · 非真实模型');vi.stubEnv('VITE_DISCUSSION_DEMO','local-http');expect(providerLabel()).toBe('真实适配器经本地 HTTP 替身验证');vi.stubEnv('VITE_DISCUSSION_DEMO','deepseek');expect(providerLabel()).toBe('Fake 演示 · 非真实模型');
});
it('受限真实验收明确阵容预置与真实讨论来源',()=>{vi.stubEnv('VITE_DISCUSSION_DEMO','live-short');expect(providerLabel()).toBe('阵容为本地预置；后续讨论内容由真实模型生成。');});

it('后端报告的两种模式独立显示，不能由存在密钥推断',()=>{expect(providerLabel({rosterProvider:'deepseek',discussionProvider:'fake'})).toBe('阵容：DeepSeek；讨论：Fake 演示（非真实模型）');expect(providerLabel({rosterProvider:'fake',discussionProvider:'deepseek'})).toBe('阵容：Fake 演示（非真实模型）；讨论：DeepSeek');});
