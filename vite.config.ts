import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { host: true },
  build: { target: "es2022" },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
