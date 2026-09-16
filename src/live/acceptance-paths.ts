/** Fixed paths identify separate user authorizations; there is no arbitrary directory override. */
export function acceptancePaths(args:readonly string[]=[]){
 if(args.length===1&&args[0]==='--r1')return {root:'.local/stage-6b-r1',anchor:'.local/stage-6b-r1-once.json',evidence:'evidence/stage-6b-r1/live'};
 if(args.length)throw Error('INVALID_ACCEPTANCE_PROFILE');
 return {root:'.local/stage-6b-live',anchor:'.local/stage-6b-once.json',evidence:'evidence/stage-6b/live'};
}
