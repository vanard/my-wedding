import { defineConfig } from '@playwright/test';

// Endpoint tests for api/: the handlers run in Node with Supabase replaced by a fake fetch.
// No browser, no server, no database. Database behaviour is covered by tests/db (opt-in).
export default defineConfig({
  testDir: './tests',
  testMatch: ['api/**/*.spec.ts', 'db/**/*.spec.ts'],
  workers: 1,
});
