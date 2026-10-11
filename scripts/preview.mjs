import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1560, height: 1120 },
  deviceScaleFactor: 1,
});
await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: '我的灵感' }).waitFor();
await page.waitForTimeout(1500);
await fs.mkdir('test-results/screenshots', { recursive: true });
await page.screenshot({ path: 'test-results/screenshots/呀哈造物-实际主页.png', fullPage: true });
await browser.close();
