import {describe,it,expect} from 'vitest';
import {nodeVersionIssue,browserOptions} from '../../scripts/reviewer-tools.mjs';

describe('reviewer environment boundaries',()=>{
 it.each(['24.16.0','24.17.1','v24.16.0'])('accepts supported Node %s',v=>expect(nodeVersionIssue(v)).toBeNull());
 it.each(['18.20.0','22.16.0','24.15.9','25.0.0','24.16.0-rc.1','garbage'])('rejects unsupported Node %s with guidance',v=>expect(nodeVersionIssue(v)).toContain('24.16.0'));
 it('uses bundled Chromium by default without an Edge channel',()=>expect(browserOptions()).toEqual({}));
 it('selects bundled Chromium explicitly',()=>expect(browserOptions('chromium')).toEqual({}));
 it.each(['msedge','chrome'] as const)('supports explicit installed %s',channel=>expect(browserOptions(channel)).toEqual({channel}));
 it('rejects typos instead of silently choosing another browser',()=>expect(()=>browserOptions('chromiun')).toThrow('E2E_BROWSER'));
});
