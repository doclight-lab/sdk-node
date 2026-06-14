import type { Doclight } from "@doclight/core"

const clients = new Set<Doclight>()
let hooksInstalled = false

async function shutdownAll(): Promise<void> {
  await Promise.all([...clients].map((client) => client.shutdown()))
}

export function registerClient(client: Doclight): void {
  clients.add(client)
}

export function installLifecycleHooksOnce(): void {
  if (hooksInstalled) return
  hooksInstalled = true

  process.on("beforeExit", () => {
    void shutdownAll()
  })

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void shutdownAll().finally(() => {
        process.kill(process.pid, signal)
      })
    })
  }
}
