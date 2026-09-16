// Test-only guard, imported explicitly by delivery verification subprocesses.
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('DELIVERY_NON_LOCAL_FETCH_BLOCKED');return nativeFetch(input,init);};
