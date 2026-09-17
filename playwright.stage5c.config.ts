import {browserOptions} from './scripts/reviewer-tools.mjs';
import {defineConfig} from '@playwright/test';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
const evidenceRoot=process.env.E2E_EVIDENCE_ROOT??'evidence/stage-5c';
mkdirSync('.tmp/stage-5c',{recursive:true});const database=process.env.STAGE5C_DATABASE??join(mkdtempSync(resolve('.tmp/stage-5c/browser-')),'test.sqlite');
process.env.STAGE5C_DATABASE=database;
export default defineConfig({
 testDir:'./e2e',workers:1,retries:0,forbidOnly:true,timeout:30000,expect:{timeout:7000},
 outputDir:evidenceRoot+'/raw/results',reporter:[['list'],['json',{outputFile:evidenceRoot+'/raw/e2e.json'}]],
 use:{baseURL:'http://127.0.0.1:41861',browserName:'chromium',...browserOptions(process.env.E2E_BROWSER),headless:true,viewport:{width:1366,height:768},screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:[{command:'node scripts/stage5c-backend.mjs',url:'http://127.0.0.1:41862/api/discussions',env:{PORT:'41862',DATABASE_PATH:database},reuseExistingServer:false,timeout:15000},{command:'node node_modules/vite/bin/vite.js --config web/vite.config.ts --port 41861',url:'http://127.0.0.1:41861',env:{WEB_API_TARGET:'http://127.0.0.1:41862'},reuseExistingServer:false,timeout:15000}]
});
