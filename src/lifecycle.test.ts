import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Doclight } from "@doclight/core"

type ProcessListener = (...args: unknown[]) => void

describe("lifecycle hooks", () => {
  const listeners: Record<string, ProcessListener[]> = {}
  let killSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    for (const event of ["beforeExit", "SIGTERM", "SIGINT"]) {
      listeners[event] = []
    }

    vi.spyOn(process, "on").mockImplementation((event, handler) => {
      listeners[event]?.push(handler as ProcessListener)
      return process
    })
    vi.spyOn(process, "once").mockImplementation((event, handler) => {
      listeners[event]?.push(handler as ProcessListener)
      return process
    })
    killSpy = vi.spyOn(process, "kill").mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function loadLifecycle() {
    return import("./lifecycle")
  }

  function mockClient(): Doclight & { shutdown: ReturnType<typeof vi.fn> } {
    const shutdown = vi.fn().mockResolvedValue(undefined)
    return { shutdown } as unknown as Doclight & {
      shutdown: ReturnType<typeof vi.fn>
    }
  }

  it("registers hooks once even when installLifecycleHooksOnce is called twice", async () => {
    const { registerClient, installLifecycleHooksOnce } = await loadLifecycle()
    registerClient(mockClient())

    installLifecycleHooksOnce()
    installLifecycleHooksOnce()

    expect(process.on).toHaveBeenCalledTimes(1)
    expect(process.once).toHaveBeenCalledTimes(2)
  })

  it("shutdowns registered clients on beforeExit", async () => {
    const { registerClient, installLifecycleHooksOnce } = await loadLifecycle()
    const client = mockClient()
    registerClient(client)
    installLifecycleHooksOnce()

    listeners.beforeExit[0]!()
    await vi.waitFor(() => expect(client.shutdown).toHaveBeenCalledOnce())
  })

  it("shutdowns registered clients on SIGTERM then re-delivers the signal", async () => {
    const { registerClient, installLifecycleHooksOnce } = await loadLifecycle()
    const client = mockClient()
    registerClient(client)
    installLifecycleHooksOnce()

    listeners.SIGTERM[0]!()

    await vi.waitFor(() => {
      expect(client.shutdown).toHaveBeenCalledOnce()
      expect(killSpy).toHaveBeenCalledWith(process.pid, "SIGTERM")
    })
  })

  it("shutdowns registered clients on SIGINT then re-delivers the signal", async () => {
    const { registerClient, installLifecycleHooksOnce } = await loadLifecycle()
    const client = mockClient()
    registerClient(client)
    installLifecycleHooksOnce()

    listeners.SIGINT[0]!()

    await vi.waitFor(() => {
      expect(client.shutdown).toHaveBeenCalledOnce()
      expect(killSpy).toHaveBeenCalledWith(process.pid, "SIGINT")
    })
  })
})
