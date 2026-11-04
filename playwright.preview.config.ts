import {defineConfig} from '@playwright/test';
// Run against the already running preview; avoids a second npm/Vite process tree.
export default defineConfig({testDir:'./tests',testMatch:'**/*.spec.ts',timeout:30000,workers:2,
  use:{baseURL:process.env.COACH_TEST_ORIGIN??'http://localhost:4186',viewport:{width:1100,height:1100}}});
