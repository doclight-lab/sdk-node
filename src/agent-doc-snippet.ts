import { createDoclight } from "@doclight/node"

const client = createDoclight({
  apiKey: process.env.DOCLIGHT_API_KEY!,
  projectId: process.env.DOCLIGHT_PROJECT_ID!,
})

const sessionId = client.startSession("verify doclight install")
client.trackToolCall({
  sessionId,
  toolName: "verify",
  status: "success",
  durationMs: 1,
})
client.endSession(sessionId, "success")

await client.shutdown()

const stats = client.getStats()
if (stats.sent < 1) {
  throw new Error(`expected sent >= 1, got ${stats.sent}`)
}
