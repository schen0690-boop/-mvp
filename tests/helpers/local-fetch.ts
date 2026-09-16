export function localFetch(transport:typeof fetch):typeof fetch{return async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(url.protocol!=='http:'||!['127.0.0.1','[::1]','localhost'].includes(url.hostname))throw Error('TEST_NON_LOCAL_NETWORK_FORBIDDEN');
 return transport(input,{...init,redirect:'error'});
};}
