import { readFileSync } from "node:fs"
import { defineConfig } from "tsup"

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string }

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" }
  },
  define: {
    __DOCLIGHT_NODE_VERSION__: JSON.stringify(pkg.version),
  },
})
