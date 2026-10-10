import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Race videos, portraits and ship art live in the repo-wide public folder.
  publicDir: root("../../public"),
  base: "./",
  resolve: {
    alias: {
      "@starlord/sim": root("../../packages/sim/src/index.ts"),
      "@starlord/ai": root("../../packages/ai/src/index.ts"),
    },
  },
});
