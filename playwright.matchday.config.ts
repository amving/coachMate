import {defineConfig} from '@playwright/test';

const externalOrigin=process.env.COACH_TEST_ORIGIN;
export default defineConfig({
  testDir:'./tests',testMatch:[
    '**/matchday-regressions.spec.ts','**/match-preparation.spec.ts',
    '**/result-only.spec.ts','**/stats-tab-navigation.spec.ts',
    '**/statistics-coverage.spec.ts','**/player-detail-refinement.spec.ts',
    '**/parent-portal.spec.ts',
  ],timeout:60000,workers:2,
  use:{baseURL:externalOrigin??'http://127.0.0.1:4176',trace:'retain-on-failure'},
  projects:[
    {name:'chromium-touch',use:{browserName:'chromium'}},
    {name:'webkit-touch',use:{browserName:'webkit'}},
  ],
  ...(!externalOrigin?{webServer:{command:'npx vite preview --host 127.0.0.1 --port 4176 --strictPort',url:'http://127.0.0.1:4176',reuseExistingServer:!process.env.CI}}:{}),
});
