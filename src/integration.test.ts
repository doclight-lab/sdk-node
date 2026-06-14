import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createDoclight } from "./create-doclight"
// Integration tests use MockIngestServer (ephemeral port), not the Python service at :8787.
import { MockIngestServer } from "./test/mock-ingest-server"

const API_KEY = "dl_test_key"
const PROJECT_ID = "proj_test"
const SESSION = "sess_integration"

function baseConfig(endpoint: string) {
  return {
    apiKey: API_KEY,
    projectId: PROJECT_ID,
    endpoint,
    lifecycleHooks: false,
    transport: {
      batchSize: 500,
      flushIntervalMs: 60_000,
      requestTimeoutMs: 500,
      retries: 3,
    },
  } as const
}

function trackThree(client: ReturnType<typeof createDoclight>): void {
  for (let i = 0; i < 3; i++) {
    client.track("session_started", { sessionId: SESSION, goal: `event-${i}` })
  }
}

describe("createDoclight integration", () => {
  let server: MockIngestServer
  const uncaught: unknown[] = []
  const unhandled: unknown[] = []

  beforeEach(() => {
    uncaught.length = 0
    unhandled.length = 0
    process.on("uncaughtException", (err) => uncaught.push(err))
    process.on("unhandledRejection", (reason) => unhandled.push(reason))
  })

  afterEach(async () => {
    process.removeAllListeners("uncaughtException")
    process.removeAllListeners("unhandledRejection")
    vi.useRealTimers()
    if (server) await server.stop()
  })

  it("happy path delivers schema-valid batch with correct auth header", async () => {
    server = new MockIngestServer({
      expectedApiKey: API_KEY,
      resolveMode: () => "success",
    })
    await server.start()

    const client = createDoclight(baseConfig(server.baseUrl))
    trackThree(client)
    await client.flush()

    expect(server.requestCount).toBe(1)
    const req = server.requests[0]!
    expect(req.headers.authorization).toBe(`Bearer ${API_KEY}`)
    expect(req.headers["x-doclight-sdk"]).toBe("@doclight/node/0.0.0")
    expect(req.batch).toBeDefined()
    expect(req.batch!.projectId).toBe(PROJECT_ID)
    expect(req.batch!.sdk.name).toBe("@doclight/node")
    expect(req.batch!.events).toHaveLength(3)
    expect(client.getStats().sent).toBe(3)

    await client.shutdown()
    expect(uncaught).toHaveLength(0)
    expect(unhandled).toHaveLength(0)
  })

  it("retries after 500 and delivers events exactly once", async () => {
    server = new MockIngestServer({
      expectedApiKey: API_KEY,
      resolveMode: (index) => (index === 0 ? "500" : "success"),
    })
    await server.start()

    const client = createDoclight(baseConfig(server.baseUrl))
    trackThree(client)

    await client.flush()
    await vi.waitFor(() => expect(server.requestCount).toBe(2))

    expect(server.requestCount).toBe(2)
    const eventIds = new Set(
      server.requests.flatMap((r) => r.batch?.events.map((e) => e.eventId) ?? []),
    )
    expect(eventIds.size).toBe(3)
    expect(client.getStats().sent).toBe(3)

    await client.shutdown()
    expect(uncaught).toHaveLength(0)
    expect(unhandled).toHaveLength(0)
  })

  it("does not retry on 401", async () => {
    server = new MockIngestServer({
      expectedApiKey: API_KEY,
      resolveMode: () => "401",
    })
    await server.start()

    const client = createDoclight(baseConfig(server.baseUrl))
    trackThree(client)
    await client.flush()

    expect(server.requestCount).toBe(1)
    expect(client.getStats().failedSends).toBe(3)
    expect(client.getStats().sent).toBe(0)

    await client.shutdown()
    expect(uncaught).toHaveLength(0)
    expect(unhandled).toHaveLength(0)
  })

  it("counts timeout failures without throwing to caller", async () => {
    server = new MockIngestServer({
      expectedApiKey: API_KEY,
      resolveMode: () => "timeout",
      timeoutDelayMs: 2000,
    })
    await server.start()

    const client = createDoclight({
      ...baseConfig(server.baseUrl),
      transport: {
        batchSize: 500,
        flushIntervalMs: 60_000,
        requestTimeoutMs: 100,
        retries: 0,
      },
    })
    trackThree(client)

    await expect(client.flush()).resolves.toBeUndefined()
    expect(client.getStats().failedSends).toBe(3)
    expect(() =>
      client.track("session_started", { sessionId: SESSION }),
    ).not.toThrow()
    await expect(client.shutdown()).resolves.toBeUndefined()
    expect(uncaught).toHaveLength(0)
    expect(unhandled).toHaveLength(0)
  })

  it("shutdown delivers pending events without explicit flush", async () => {
    server = new MockIngestServer({
      expectedApiKey: API_KEY,
      resolveMode: () => "success",
    })
    await server.start()

    const client = createDoclight(baseConfig(server.baseUrl))
    trackThree(client)
    await client.shutdown()

    expect(server.requestCount).toBe(1)
    expect(server.requests[0]!.batch?.events).toHaveLength(3)
    expect(client.getStats().sent).toBe(3)

    expect(uncaught).toHaveLength(0)
    expect(unhandled).toHaveLength(0)
  })

  it("server down never throws to application code", async () => {
    server = new MockIngestServer({
      expectedApiKey: API_KEY,
      resolveMode: () => "success",
    })
    await server.start()
    const deadEndpoint = server.baseUrl
    await server.stop()

    const client = createDoclight(baseConfig(deadEndpoint))
    trackThree(client)

    await expect(client.flush()).resolves.toBeUndefined()
    await expect(client.shutdown()).resolves.toBeUndefined()

    expect(client.getStats().failedSends).toBe(3)
    expect(uncaught).toHaveLength(0)
    expect(unhandled).toHaveLength(0)
  })
})
