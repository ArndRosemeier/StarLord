import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@starlord/sim": fileURLToPath(new URL("./packages/sim/src/index.ts", import.meta.url)),
      "@starlord/ai": fileURLToPath(new URL("./packages/ai/src/index.ts", import.meta.url)),
    },
  },
  test: { include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.{ts,tsx}"] },
});
