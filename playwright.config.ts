import { defineConfig, devices } from '@playwright/test';
import { hashPassword } from './src/auth/password';
const dbUrl = 'postgres://postgres:postgres@127.0.0.1:54320/manicure_e2e';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  workers: 1,
  use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: 'http://127.0.0.1:3333' },
  webServer: [
    { command: 'node --import tsx scripts/telegram-stub.ts', url: 'http://127.0.0.1:54321/__messages', reuseExistingServer: false, timeout: 30_000 },
    { command: 'node --import tsx tests/e2e/prepare-db.ts && npm.cmd run build && node node_modules/next/dist/bin/next start -p 3333', url: 'http://127.0.0.1:3333', reuseExistingServer: false, timeout: 180_000,
      env: { DATABASE_URL: dbUrl, BOT_USERNAME: 'test_booking_bot', TELEGRAM_BOT_TOKEN: '123:TEST', TELEGRAM_API_ROOT: 'http://127.0.0.1:54321', RATE_LIMIT_BOOKINGS_PER_HOUR: '100000', DEMO_MODE: 'true', SESSION_SECRET: 'test-session-secret-long-enough', MANAGER_LOGIN: 'manager', MANAGER_PASSWORD_HASH: hashPassword('demo-password-for-tests'), MASTER_1_INVITE: 'first-private-invite-for-tests', MASTER_2_INVITE: 'second-private-invite-for-tests', CRON_SECRET: 'test-cron-secret' } },
  ],
});
