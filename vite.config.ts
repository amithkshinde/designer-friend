import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { host: true },
  // Default build target ("modules") transpiles to Chrome 87, Edge 88, Firefox 78 and Safari 14.
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
