import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'./tests/e2e',fullyParallel:false,workers:1,timeout:120000,
  globalTeardown:'./tests/e2e/stop.mjs',
  use:{baseURL:'http://127.0.0.1:3027',browserName:'chromium',channel:'msedge',viewport:{width:390,height:844},trace:'retain-on-failure',actionTimeout:15000},
  webServer:{command:'node tests/e2e/server.mjs',url:'http://127.0.0.1:3027',timeout:120000,reuseExistingServer:false},
})
