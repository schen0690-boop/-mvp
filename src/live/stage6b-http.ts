import type {RequestHandler} from 'express';
import type {DiscussionAuthorization} from './discussion-authorization.js';
export function restrictStage6bWrites(auth:DiscussionAuthorization):RequestHandler{return (req,res,next)=>{
 if(req.method==='GET')return next();
 const allowed=[`/api/discussions/${auth.binding.discussionId}/stop`,...(!auth.closed?[`/api/discussions/${auth.binding.discussionId}/start`]:[])];
 if(req.method==='POST'&&allowed.includes(req.path))return next();
 res.status(409).json({error:{code:'INVALID_STATE',message:'本验收仅允许绑定讨论的一次运行',retryable:false,action:'none',requestId:crypto.randomUUID()}});
};}
