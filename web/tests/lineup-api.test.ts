import { expect, it } from 'vitest';
import { ApiError, createApi } from '../src/api.js';
import { sample } from './lineup-fixtures.js';
const generating=sample('generating_lineup'), ready=sample('awaiting_confirmation'), confirmed=sample('lineup_confirmed');
const id=generating.discussionId, generationId=generating.lineupGeneration!.generationId;
const input={requestId:id,expectedGenerationId:null};
const output={discussionId:id,generationId,generationVersion:1,snapshot:generating,replayed:false};
it('generation sends exact current base and validates 202 acceptance',async()=>{
  let sent:RequestInit|undefined, path='';
  const api=createApi(async(url,init)=>{path=String(url);sent=init;return Response.json(output,{status:202});});
  expect(await api.generate(id,input)).toEqual(output);
  expect(path).toBe(`/api/discussions/${id}/lineup`);expect(sent?.method).toBe('POST');expect(JSON.parse(String(sent?.body))).toEqual(input);
});
it('confirm submits exact dual version and accepts confirmed snapshot',async()=>{
  let body='';const response={discussionId:id,snapshot:confirmed,replayed:false};
  const api=createApi(async(_,init)=>{body=String(init?.body);return Response.json(response);});
  expect(await api.confirm(id,{generationId,lineupRevision:1})).toEqual(response);
  expect(JSON.parse(body)).toEqual({generationId,lineupRevision:1});
});
it('replayed generation accepts a ready current result',async()=>{
  const result={...output,snapshot:ready,replayed:true};
  expect(await createApi(async()=>Response.json(result)).generate(id,input)).toEqual(result);
});
it('rejects unrelated discussion/generation, extra private fields and false confirmation',async()=>{
  for(const body of [{...output,generationVersion:9},{...output,generationId:id},{...output,raw:'private'},{...output,discussionId:generationId}]) {
    await expect(createApi(async()=>Response.json(body,{status:202})).generate(id,input)).rejects.toThrow('不符合约定');
  }
  await expect(createApi(async()=>Response.json({discussionId:id,snapshot:ready,replayed:false})).confirm(id,{generationId,lineupRevision:1})).rejects.toThrow('不符合约定');
});
it.each([409,500,503])('typed safe HTTP %i never exposes response diagnostics',async status=>{
  const api=createApi(async()=>Response.json({error:{message:'SQL private stack'}},{status}));
  try {await api.confirm(id,{generationId,lineupRevision:1});throw new Error('unexpected success');}
  catch(error){expect(error).toBeInstanceOf(ApiError);expect(error).toMatchObject({status});expect(String(error)).not.toContain('SQL');}
});
