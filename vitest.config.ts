import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { configDefaults, defineConfig } from "vitest/config"

const srcDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    // .github/scripts holds node:test controllers, not vitest suites.
    exclude: [...configDefaults.exclude, ".github/**"],
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
