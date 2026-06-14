import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const srcDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
  },
  resolve: {
    alias: {
      "@doclight/node": join(srcDir, "src/index.ts"),
    },
  },
  define: {
    __DOCLIGHT_NODE_VERSION__: JSON.stringify("0.0.0"),
  },
})
