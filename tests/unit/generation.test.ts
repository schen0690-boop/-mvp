import { expect, it } from 'vitest';
import { assertGenerationState } from '../../src/domain/lineup-service.js';
it.each(['lineup_confirmed','running','stopping','completed','failed','unknown'])('generation is locked in %s including future states',status=>{
  expect(()=>assertGenerationState(status)).toThrow('当前状态不能生成阵容');
});
it.each(['created','generating_lineup','awaiting_confirmation','lineup_generation_failed'])('known %s proceeds to version/idempotency checks',status=>{
  expect(()=>assertGenerationState(status)).not.toThrow();
});
