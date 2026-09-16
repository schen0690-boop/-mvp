import express, { type Request, type Response, type NextFunction } from 'express';
import type { DraftService } from '../domain/drafts.js';
import { AppError, invalidInput } from '../domain/errors.js';
import { isObject } from '../domain/input.js';
import { randomUUID } from 'node:crypto';
import type { LineupService } from '../domain/lineup-service.js';
import type { DiscussionService } from '../domain/discussion-service.js';

export interface Diagnostic { requestId: string; code: 'INTERNAL_ERROR' }

export function createApp(service: DraftService, diagnose: (event: Diagnostic) => void = event => console.error(event), lineup?: LineupService, discussion?: DiscussionService) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const jsonOnly = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.is('application/json')) invalidInput('请求正文须使用application/json');
    const origin = req.get('origin');
    if (origin) {
      let allowed = false;
      try {
        const parsed = new URL(origin);
        allowed = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
          && origin === `http://${req.get('host')}`;
      } catch { /* Invalid origins are rejected below. */ }
      if (!allowed) invalidInput('请求来源不受支持');
    }
    next();
  };
  const parser=express.json({ limit: '16kb', inflate: false });
  app.post('/api/discussions', jsonOnly, parser, (req, res) => {
    const result = service.create(req.body);
    lineup?.assertAvailable(result.discussionId);
    discussion?.assertAvailable(result.discussionId);
    res.status(result.replayed ? 200 : 201).json(result);
  });
  app.get('/api/discussions', (req, res) => {
    lineup?.assertAvailable();
    discussion?.assertAvailable();
    if (Object.keys(req.query).some(key => key !== 'status')) invalidInput('列表含未声明的参数');
    res.json(service.list(req.query.status));
  });
  app.get('/api/discussions/:discussionId', (req, res) => {
    lineup?.assertAvailable(req.params.discussionId);
    discussion?.assertAvailable(req.params.discussionId);
    res.json(service.get(req.params.discussionId));
  });
  if(lineup){
    app.post('/api/discussions/:discussionId/lineup',jsonOnly,parser,(req,res)=>{
      const result=lineup.generate(req.params.discussionId,req.body);
      res.status(result.snapshot.status==='generating_lineup'?202:200).json(result);
    });
    app.post('/api/discussions/:discussionId/lineup/confirm',jsonOnly,parser,(req,res)=>{
      res.json(lineup.confirm(req.params.discussionId,req.body));
    });
  }
  if(discussion){
    app.post('/api/discussions/:discussionId/start',jsonOnly,parser,(req,res)=>{
      const result=discussion.start(req.params.discussionId,req.body);res.status(result.replayed?200:202).json(result);
    });
    app.post('/api/discussions/:discussionId/stop',jsonOnly,parser,(req,res)=>{
      const snapshot=discussion.stop(req.params.discussionId,req.body);res.status(snapshot.status==='stopping'?202:200).json(snapshot);
    });
  }
  app.use(() => { throw new AppError('NOT_FOUND', '未找到请求的资源', 404); });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const requestId = randomUUID();
    const parserFailure = isObject(error) && typeof error.type === 'string' &&
      ['entity.parse.failed', 'entity.too.large', 'encoding.unsupported', 'charset.unsupported', 'request.aborted', 'request.size.invalid'].includes(error.type);
    const known = error instanceof AppError ? error : parserFailure || error instanceof URIError
      ? new AppError('INVALID_INPUT', '请求JSON格式或正文大小不符合要求', 400) : undefined;
    if (!known) diagnose({ requestId, code: 'INTERNAL_ERROR' });
    const retryable=!known || known.status>=500 || known.status===429;
    res.status(known?.status ?? 500).json({ error: {
      code: known?.code ?? 'INTERNAL_ERROR', message: known?.message ?? '服务暂时无法完成请求，请重试',
      retryable, action: retryable ? 'try_again' : 'none', requestId
    } });
  });
  return app;
}
