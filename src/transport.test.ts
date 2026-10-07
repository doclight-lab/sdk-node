import { describe, expect, it, vi } from "vitest"
import type { IngestBatchRequest } from "@doclight/core"
import { HttpTransport, MAX_RETRY_AFTER_MS, parseRetryAfterMs } from "./transport"

const batch = {
  schemaVersion: "1",
  projectId: "p",
  sdk: { name: "@doclight/node", version: "0" },
  events: [],
} as IngestBatchRequest

function make(res: () => Response | Promise<Response>) {
  const fetch = vi.fn(async () => res())
  const t = new HttpTransport({
    apiKey: "dl_secret",
    endpoint: "http://x",
    fetch: fetch as unknown as typeof globalThis.fetch,
  })
  return { t, fetch }
}

describe("HttpTransport", () => {
  it("treats a full acknowledgement as ok and resends the same batch object", async () => {
    const { t, fetch } = make(
      () => new Response(JSON.stringify({ accepted: 1, rejected: 0 }), { status: 200 }),
    )
    expect(await t.send(batch, { timeoutMs: 100 })).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("treats empty and malformed 2xx bodies as ok", async () => {
    expect((await make(() => new Response(null, { status: 204 })).t.send(batch, { timeoutMs: 100 })).ok).toBe(true)
    expect((await make(() => new Response("{nope", { status: 200 })).t.send(batch, { timeoutMs: 100 })).ok).toBe(true)
  })

  it("does not report rejected events as delivered", async () => {
    const { t } = make(
      () => new Response(JSON.stringify({ accepted: 1, rejected: 2 }), { status: 200 }),
    )
    const r = await t.send(batch, { timeoutMs: 100 })
    expect(r).toMatchObject({ ok: false, retryable: false })
  })

  it.each([
    [408, true],
    [429, true],
    [503, true],
    [400, false],
    [401, false],
    [403, false],
    [413, false],
  ])("HTTP %i retryable=%s", async (status, retryable) => {
    const r = await make(() => new Response("", { status })).t.send(batch, { timeoutMs: 100 })
    expect(r).toMatchObject({ ok: false, retryable })
  })

  it("surfaces a bounded Retry-After on 429 without throwing", async () => {
    const r = await make(
      () => new Response("", { status: 429, headers: { "retry-after": "99999" } }),
    ).t.send(batch, { timeoutMs: 100 })
    expect(r).toMatchObject({ ok: false, retryable: true })
    expect((r as { reason: string }).reason).toContain(`${MAX_RETRY_AFTER_MS}ms`)
  })

  it("reports thrown errors as retryable and never leaks the api key", async () => {
    const r = await make(() => {
      throw new Error("boom dl_secret")
    }).t.send(batch, { timeoutMs: 100 })
    expect(r).toMatchObject({ ok: false, retryable: true })
    expect((r as { reason: string }).reason).not.toContain("dl_secret")
  })
})

describe("parseRetryAfterMs", () => {
  it("parses seconds, dates, caps, and rejects junk", () => {
    expect(parseRetryAfterMs("2")).toBe(2000)
    expect(parseRetryAfterMs("100000")).toBe(MAX_RETRY_AFTER_MS)
    const now = Date.UTC(2026, 0, 1)
    expect(parseRetryAfterMs(new Date(now + 5000).toUTCString(), now)).toBe(5000)
    expect(parseRetryAfterMs(new Date(now - 5000).toUTCString(), now)).toBe(0)
    expect(parseRetryAfterMs("nonsense")).toBeUndefined()
    expect(parseRetryAfterMs(null)).toBeUndefined()
  })
})
