import {test,expect} from 'vitest';
import {acceptancePaths} from '../../src/live/acceptance-paths.js';
test('R1 uses independent fixed database/anchor/evidence without changing old paths',()=>{
 expect(acceptancePaths([])).toEqual({root:'.local/stage-6b-live',anchor:'.local/stage-6b-once.json',evidence:'evidence/stage-6b/live'});
 expect(acceptancePaths(['--r1'])).toEqual({root:'.local/stage-6b-r1',anchor:'.local/stage-6b-r1-once.json',evidence:'evidence/stage-6b-r1/live'});
});
test('arbitrary path, later authorization and combined flags rejected',()=>{for(const args of [['--r2'],['--r1','--r1'],['--root','tmp']])expect(()=>acceptancePaths(args)).toThrow('INVALID_ACCEPTANCE_PROFILE');});
