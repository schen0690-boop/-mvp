import type {DatabaseSync} from 'node:sqlite';
const listeners=new WeakMap<DatabaseSync,Set<()=>void>>();
export function onCommit(db:DatabaseSync,listener:()=>void):()=>void{
 let set=listeners.get(db);if(!set){set=new Set();listeners.set(db,set);}set.add(listener);
 return ()=>{set.delete(listener);};
}
export function committed(db:DatabaseSync):void{
 // A notification carries no data. Subscribers read committed rows in a later microtask.
 for(const listener of listeners.get(db)??[])try{listener();}catch{/* Observer failure cannot undo a committed business operation. */}
}
export const subscriberCount=(db:DatabaseSync)=>listeners.get(db)?.size??0;
