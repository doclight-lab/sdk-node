// Packs the package and checks metadata, tarball contents and clean ESM/CJS consumers.
// Never publishes. Usage: node scripts/verify-package.mjs  (run after `pnpm build`)
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = new URL("..", import.meta.url).pathname
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const fail = (m) => { console.error(`verify-package: ${m}`); process.exit(1) }
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8" })

if (pkg.name !== "@doclight/node") fail(`unexpected name ${pkg.name}`)
if (pkg.publishConfig?.access !== "public") fail("publishConfig.access must be public")
for (const k of ["homepage", "bugs", "repository"]) if (!pkg[k]) fail(`missing ${k}`)
const repoUrl = pkg.repository.url ?? ""
if (!repoUrl.includes("github.com/doclight-lab/sdk-node")) fail(`repository.url ${repoUrl} does not match github.com/doclight-lab/sdk-node`)

const out = mkdtempSync(join(tmpdir(), "doclight-pack-"))
run("pnpm", ["pack", "--pack-destination", out], root)
const tgz = readdirSync(out).find((f) => f.endsWith(".tgz"))
if (!tgz) fail("no tarball produced")
const files = run("tar", ["-tzf", join(out, tgz)]).split("\n").filter(Boolean)
for (const need of ["package/package.json", "package/dist/index.mjs", "package/dist/index.cjs", "package/dist/index.d.ts"]) {
  if (!files.includes(need)) fail(`tarball missing ${need}`)
}
const bad = files.filter((f) => /(^package\/(src|\.env|\.github|\.changeset))|\.env|\.npmrc/.test(f))
if (bad.length) fail(`unexpected files in tarball: ${bad.join(", ")}`)

// Clean consumers. @doclight/core is installed from the registry; failure here means it is unavailable.
for (const kind of ["esm", "cjs"]) {
  const dir = mkdtempSync(join(tmpdir(), `doclight-${kind}-`))
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "consumer", private: true, type: kind === "esm" ? "module" : "commonjs" }))
  run("npm", ["install", "--no-audit", "--no-fund", join(out, tgz)], dir)
  const file = join(dir, kind === "esm" ? "t.mjs" : "t.cjs")
  writeFileSync(file, kind === "esm"
    ? `import * as m from "@doclight/node"; if (!Object.keys(m).length) process.exit(1); console.log("esm ok")`
    : `const m = require("@doclight/node"); if (!Object.keys(m).length) process.exit(1); console.log("cjs ok")`)
  console.log(run("node", [file], dir).trim())
}
console.log(`verify-package: ${pkg.name}@${pkg.version} OK (${tgz})`)
