import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Тесты без базы: чистые функции. Запускаются и там, где Postgres недоступен.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
