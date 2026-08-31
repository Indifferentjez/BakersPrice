import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each worker gets a throwaway in-memory SQLite DB, seeded from
    // data/master-ingredients.json on first import.
    env: { DB_PATH: ':memory:', VITEST: 'true' },
  },
});
