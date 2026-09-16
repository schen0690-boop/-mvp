import {defineConfig} from '@playwright/test';
import previous from './playwright.config.js';
// Reuse the existing Fake regression environment, preserve earlier raw reports.
export default defineConfig(previous,{
 outputDir:'evidence/stage-5b/raw/results',
 reporter:[['list'],['json',{outputFile:'evidence/stage-5b/raw/e2e.json'}]]
});
