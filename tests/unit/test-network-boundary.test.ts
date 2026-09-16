import {expect,it,vi} from 'vitest';
import {localFetch} from '../helpers/local-fetch.js';
it('测试网络边界在传输前禁止非loopback地址，不读取进程密钥',async()=>{
 const transport=vi.fn(async()=>new Response('local'));const send=localFetch(transport);
 await expect(send('https://api.deepseek.com/chat/completions')).rejects.toThrow('TEST_NON_LOCAL_NETWORK_FORBIDDEN');expect(transport).not.toHaveBeenCalled();
 await send('http://127.0.0.1:12345');expect(transport).toHaveBeenCalledTimes(1);
});
