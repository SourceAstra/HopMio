import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export default defineConfig({
  testDir: './tests/ui',
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1500, height: 1050 },
    headless: true,
    launchOptions: fs.existsSync(edge) ? { executablePath: edge } : {},
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    env: { YAHA_DATA_DIR: '.yaha-ui-check' },
    timeout: 120000,
  },
  workers: 1,
});
