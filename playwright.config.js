import fs from 'node:fs';
import { defineConfig, chromium } from '@playwright/test';

const hasBundledChromium = (() => {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

export default defineConfig({
  testDir: './tests',
  testMatch: 'nav.spec.js',
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    ...(hasBundledChromium ? {} : { channel: 'chrome' })
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30000
  }
});
