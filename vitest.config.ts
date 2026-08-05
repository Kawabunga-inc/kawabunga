import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/engine/src/**/*.test.ts",
      "packages/live-scene/src/**/*.test.{ts,tsx}",
      "packages/db/src/**/*.test.ts",
      "packages/wiki-curator/src/**/*.test.ts",
      "packages/orchestration/src/**/*.test.ts",
      "packages/voice-pipeline/src/**/*.test.ts",
      "apps/admin/src/**/*.test.ts",
      "apps/web/src/**/*.test.ts",
      "services/voice-agent/src/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@kawabunga/types": path.resolve(__dirname, "packages/types/src"),
      "@kawabunga/utils": path.resolve(__dirname, "packages/utils/src"),
      "@kawabunga/db": path.resolve(__dirname, "packages/db/src"),
      "@kawabunga/engine": path.resolve(__dirname, "packages/engine/src"),
      "@kawabunga/live-scene/server": path.resolve(__dirname, "packages/live-scene/src/server/index.ts"),
      "@kawabunga/live-scene": path.resolve(__dirname, "packages/live-scene/src/index.ts"),
      "@kawabunga/wiki-curator": path.resolve(__dirname, "packages/wiki-curator/src"),
      "@kawabunga/orchestration": path.resolve(__dirname, "packages/orchestration/src"),
      "@kawabunga/orchestration/client": path.resolve(__dirname, "packages/orchestration/src/client.ts"),
      "@kawabunga/orchestration/journal": path.resolve(__dirname, "packages/orchestration/src/journal.ts"),
      "@kawabunga/orchestration/server": path.resolve(__dirname, "packages/orchestration/src/server.ts"),
      "@": path.resolve(__dirname, "apps/admin/src"),
    },
  },
});
