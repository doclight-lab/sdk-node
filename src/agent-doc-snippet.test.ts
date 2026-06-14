import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"

const docPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/agents/install-node-sdk.md",
)

function normalizeCode(code: string): string {
  return code
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
}

function extractTsBlock(markdown: string): string {
  const match = markdown.match(/```ts\n([\s\S]*?)```/)
  if (!match) throw new Error("install-node-sdk.md is missing a ts code block")
  return match[1]!
}

describe("agent doc snippet", () => {
  it("compiles and runs the agent-doc-snippet module", async () => {
    process.env.DOCLIGHT_API_KEY = "dl_snippet_test"
    process.env.DOCLIGHT_PROJECT_ID = "proj_snippet_test"

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ accepted: 3, rejected: 0 }),
      })),
    )

    await import("./agent-doc-snippet")
  })

  it("matches the Code Changes block in install-node-sdk.md", () => {
    const snippet = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "agent-doc-snippet.ts"),
      "utf8",
    )
    const docBlock = extractTsBlock(readFileSync(docPath, "utf8"))
    expect(normalizeCode(docBlock)).toBe(normalizeCode(snippet))
  })
})
