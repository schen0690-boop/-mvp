export type ErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'IDEMPOTENCY_CONFLICT' | 'INVALID_STATE' |
  'GENERATION_IN_PROGRESS' | 'STALE_GENERATION' | 'STALE_LINEUP' | 'LINEUP_NOT_READY' | 'CAPACITY_REACHED' | 'STORAGE_UNAVAILABLE';

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly status: number) {
    super(message);
  }
}

export function invalidInput(message = '请求参数不符合要求'): never {
  throw new AppError('INVALID_INPUT', message, 400);
}
