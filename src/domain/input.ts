import { invalidInput } from './errors.js';

export interface CreateDraftInput {
  topic: string;
  expertCount: number;
  requestId: string;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    invalidInput('标识必须为有效UUID');
  }
  return value.toLowerCase();
}

export function validateCreateDraft(input: unknown): CreateDraftInput {
  if (!isObject(input) || Object.keys(input).some(key => !['topic', 'expertCount', 'requestId'].includes(key))) {
    invalidInput('请求须为对象，且只能包含声明的字段');
  }
  if (typeof input.topic !== 'string') invalidInput('话题必须为字符串');
  const topic = input.topic.trim();
  if ([...topic].length < 1 || [...topic].length > 500) invalidInput('话题须为1至500个字符');
  const expertCount = Object.hasOwn(input, 'expertCount') ? input.expertCount : 4;
  if (typeof expertCount !== 'number' || !Number.isInteger(expertCount) || expertCount < 1 || expertCount > 8) {
    invalidInput('专家人数须为1至8的整数');
  }
  return { topic, expertCount, requestId: validateUuid(input.requestId) };
}
