import {browserOptions} from './scripts/reviewer-tools.mjs';
import {defineConfig} from '@playwright/test';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
const evidenceRoot=process.env.E2E_LOCAL_EVIDENCE_ROOT??'evidence/stage-6a';
mkdirSync('.tmp/stage-6a',{recursive:true});const database=process.env.STAGE6A_DATABASE??join(mkdtempSync(resolve('.tmp/stage-6a/browser-')),'test.sqlite');process.env.STAGE6A_DATABASE=database;
export default defineConfig({
 testDir:'./e2e-local',workers:1,retries:0,forbidOnly:true,timeout:30000,expect:{timeout:7000},
 outputDir:evidenceRoot+'/raw/local-results',reporter:[['list'],['json',{outputFile:evidenceRoot+'/raw/local-e2e.json'}]],
 use:{baseURL:'http://127.0.0.1:41871',browserName:'chromium',...browserOptions(process.env.E2E_BROWSER),headless:true,viewport:{width:1366,height:768},screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:[{command:'node scripts/stage6a-backend.mjs',url:'http://127.0.0.1:41872/api/discussions',env:{PORT:'41872',DATABASE_PATH:database},reuseExistingServer:false,timeout:15000},{command:'node node_modules/vite/bin/vite.js --config web/vite.config.ts --port 41871',url:'http://127.0.0.1:41871',env:{WEB_API_TARGET:'http://127.0.0.1:41872',VITE_DISCUSSION_DEMO:'local-http'},reuseExistingServer:false,timeout:15000}]
});
