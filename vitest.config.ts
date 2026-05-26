import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/domain/rpus/**/*.ts", "src/domain/providers/local/**/*.ts", "src/server/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/domain/providers/local/seed.ts"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80
      }
    }
  },
});
