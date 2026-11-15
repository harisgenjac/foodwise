import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Test uploads stay apart from the dev server's files (see src/services/storage.ts).
    env: { UPLOADS_DIR: "uploads-test" },
    // All suites share one real test database, so files run one at a time.
    fileParallelism: false,
  },
});
