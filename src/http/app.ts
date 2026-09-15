import express, { type Request, type Response, type NextFunction } from 'express';
import type { DraftService } from '../domain/drafts.js';
import { AppError, invalidInput } from '../domain/errors.js';
import { isObject } from '../domain/input.js';
import { randomUUID } from 'node:crypto';

export interface Diagnostic { requestId: string; code: 'INTERNAL_ERROR' }

export function createApp(service: DraftService, diagnose: (event: Diagnostic) => void = event => console.error(event)) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.post('/api/discussions', (req, _res, next) => {
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
  }, express.json({ limit: '16kb', inflate: false }), (req, res) => {
    const result = service.create(req.body);
    res.status(result.replayed ? 200 : 201).json(result);
  });
  app.get('/api/discussions', (req, res) => {
    if (Object.keys(req.query).some(key => key !== 'status')) invalidInput('列表含未声明的参数');
    res.json(service.list(req.query.status));
  });
  app.get('/api/discussions/:discussionId', (req, res) => {
    res.json(service.get(req.params.discussionId));
  });
  app.use(() => { throw new AppError('NOT_FOUND', '未找到请求的资源', 404); });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const requestId = randomUUID();
    const parserFailure = isObject(error) && typeof error.type === 'string' &&
      ['entity.parse.failed', 'entity.too.large', 'encoding.unsupported', 'charset.unsupported', 'request.aborted', 'request.size.invalid'].includes(error.type);
    const known = error instanceof AppError ? error : parserFailure || error instanceof URIError
      ? new AppError('INVALID_INPUT', '请求JSON格式或正文大小不符合要求', 400) : undefined;
    if (!known) diagnose({ requestId, code: 'INTERNAL_ERROR' });
    res.status(known?.status ?? 500).json({ error: {
      code: known?.code ?? 'INTERNAL_ERROR', message: known?.message ?? '服务暂时无法完成请求，请重试',
      retryable: !known, action: known ? 'none' : 'try_again', requestId
    } });
  });
  return app;
}
