import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './.scratch/e2e-results',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // Deterministic sequential runs against scratch DB
  reporter: [
    ['list'],
    ['json', { outputFile: './.scratch/e2e-results/test-results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3002',
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'Chromium desktop 1280',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'Chromium mobile 390x844',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    // The narrow widths are the ones a phone in portrait actually is. They
    // used to be untested, which is how a page that only overflowed below
    // 390px stayed invisible.
    {
      name: 'Chromium mobile 360x800',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'Chromium mobile 320x568',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 320, height: 568 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'WebKit iPhone 13',
      use: {
        ...devices['iPhone 13'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'WebKit mobile 360x800',
      use: {
        ...devices['iPhone 13'],
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'WebKit mobile 320x568',
      use: {
        ...devices['iPhone 13'],
        viewport: { width: 320, height: 568 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'tablet 768',
      use: {
        ...devices['iPad Mini'],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'WebKit desktop 1280',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
