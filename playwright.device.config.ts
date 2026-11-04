import { defineConfig } from '@playwright/test';
// Verification against the running development server, before accepting runtime lock changes.
export default defineConfig({ testDir:'./tests', testMatch:'**/*.spec.ts', timeout:30000,
  use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1100,height:1100}}, workers:2 });
