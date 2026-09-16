import {it,expect} from 'vitest';
import {selectProviders} from '../../src/app-providers.js';
import {FakeRosterProvider} from '../../src/providers/fake-roster.js';
import {FakeDiscussionProvider} from '../../src/providers/fake-discussion.js';
import {DeepSeekRosterProvider} from '../../src/providers/deepseek.js';
import {DeepSeekDiscussionProvider} from '../../src/providers/deepseek-discussion.js';
it('默认无论继承密钥是否存在均Fake且不调用传输',()=>{let sent=0;const p=selectProviders({DEEPSEEK_API_KEY:'test-only'},false,async()=>{sent++;throw Error();});expect(p.roster).toBeInstanceOf(FakeRosterProvider);expect(p.discussion).toBeInstanceOf(FakeDiscussionProvider);expect(sent).toBe(0);});
it('显式选择真实还须启动开关；缺配置拒绝不静默回退',()=>{expect(()=>selectProviders({DISCUSSION_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'test-only'})).toThrow();expect(()=>selectProviders({DISCUSSION_PROVIDER:'deepseek'},true)).toThrow();});
it('阵容与讨论可独立选择，构造零传输，公开配置不含凭据',()=>{let sent=0;const values={ROSTER_PROVIDER:'deepseek',DISCUSSION_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'test-only'};const p=selectProviders(values,true,async()=>{sent++;throw Error();});expect(p.roster).toBeInstanceOf(DeepSeekRosterProvider);expect(p.discussion).toBeInstanceOf(DeepSeekDiscussionProvider);expect(p.publicConfig).toEqual({rosterProvider:'deepseek',discussionProvider:'deepseek'});expect(selectProviders({...values,ROSTER_PROVIDER:'fake'},true).roster).toBeInstanceOf(FakeRosterProvider);expect(sent).toBe(0);});
