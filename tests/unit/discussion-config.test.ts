import {expect,it} from 'vitest';
import {readDiscussionConfig,createDiscussionProvider} from '../../src/providers/discussion-config.js';
import {FakeDiscussionProvider} from '../../src/providers/fake-discussion.js';
it('默认Fake与阵容选择/已配置密钥独立，deepseek缺配置不能回退',()=>{
 expect(createDiscussionProvider(readDiscussionConfig({ROSTER_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'local-stub-only'}))).toBeInstanceOf(FakeDiscussionProvider);
 expect(()=>readDiscussionConfig({DISCUSSION_PROVIDER:'deepseek'})).toThrow('configuration');
 expect(()=>readDiscussionConfig({DISCUSSION_PROVIDER:'unknown'})).toThrow('configuration');
});
it('显式DeepSeek配置仍需要显式传输注入；固定地址不能被普通配置放宽',()=>{
 const c=readDiscussionConfig({DISCUSSION_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'local-stub-only'});
 expect(c.provider).toBe('deepseek');expect(()=>createDiscussionProvider(c)).toThrow('configuration');
 expect(()=>readDiscussionConfig({DISCUSSION_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'local-stub-only',DEEPSEEK_BASE_URL:'http://127.0.0.1'})).toThrow('configuration');
});
