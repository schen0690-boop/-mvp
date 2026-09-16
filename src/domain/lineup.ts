export interface CandidateMember { role: 'moderator' | 'expert'; name: string; profession: string; title: string; stance: string }
export interface LineupMember extends CandidateMember { memberId: string; color: string; displayOrder: number }
export class RosterValidationError extends Error {
  constructor(public readonly code: 'LINEUP_INVALID_STRUCTURE' | 'LINEUP_INVALID_MEMBERS') { super(code); }
}
export const colors = ['#193455', '#2157a5', '#137568', '#8b4c20', '#734a9c', '#9d3659', '#496625', '#345d78', '#704d00'];
function structure(): never { throw new RosterValidationError('LINEUP_INVALID_STRUCTURE'); }
function business(): never { throw new RosterValidationError('LINEUP_INVALID_MEMBERS'); }
export function nameKey(name: string): string { return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase(); }
export function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function parseRoster(raw: unknown, expertCount: number): CandidateMember[] {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 16384) structure();
  let data: unknown;
  try { data = JSON.parse(raw); } catch { structure(); }
  if (!isObject(data) || !exactKeys(data, ['roles']) || !Array.isArray(data.roles)) structure();
  const members = data.roles.map((item: unknown): CandidateMember => {
    if (!isObject(item) || !exactKeys(item, ['role', 'name', 'profession', 'title', 'stance']) ||
        (item.role !== 'moderator' && item.role !== 'expert') || typeof item.name !== 'string' ||
        typeof item.profession !== 'string' || typeof item.title !== 'string' || typeof item.stance !== 'string') structure();
    return { role: item.role, name: item.name, profession: item.profession, title: item.title, stance: item.stance };
  });
  if (members.filter(m => m.role === 'moderator').length !== 1 || members.filter(m => m.role === 'expert').length !== expertCount) business();
  const normalized = members.map(m => {
    for (const [value, max] of [[m.name, 64], [m.profession, 80], [m.title, 80], [m.stance, 200]] as const) {
      if (/[\u0000-\u001f\u007f]/u.test(value) || [...value.trim()].length < 1 || [...value.trim()].length > max) business();
    }
    return { role: m.role, name: m.name.trim(), profession: m.profession.trim(), title: m.title.trim(), stance: m.stance.trim() };
  });
  if (new Set(normalized.map(m => nameKey(m.name))).size !== normalized.length) business();
  return normalized;
}
export function enrichRoster(members: CandidateMember[]): LineupMember[] {
  return [...members.filter(m => m.role === 'moderator'), ...members.filter(m => m.role === 'expert')].map((m, displayOrder) => {
    const color = colors[displayOrder];
    if (!color) business();
    return { ...m, memberId: crypto.randomUUID(), color, displayOrder };
  });
}
export function validateGenerate(input: unknown): { requestId: string; expectedGenerationId: string | null } {
  if (!isObject(input) || !exactKeys(input, ['requestId', 'expectedGenerationId'])) invalidInput();
  return { requestId: validateUuid(input.requestId), expectedGenerationId: input.expectedGenerationId === null ? null : validateUuid(input.expectedGenerationId) };
}
export function validateConfirm(input: unknown): { generationId: string; lineupRevision: number } {
  if (!isObject(input) || !exactKeys(input, ['generationId', 'lineupRevision']) ||
      typeof input.lineupRevision !== 'number' || !Number.isSafeInteger(input.lineupRevision) || input.lineupRevision < 1) invalidInput();
  return { generationId: validateUuid(input.generationId), lineupRevision: input.lineupRevision };
}
import { isObject, validateUuid } from './input.js';
import { invalidInput } from './errors.js';
