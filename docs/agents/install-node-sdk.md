# Install the Doclight Node SDK

## Goal

Wire a Node.js agent or service to Doclight ingest so session and tool-call events appear in the dashboard.

## When to Use This Guide

Use this when you have a Node 18+ process (agent runner, API worker, CLI) and need HTTP ingest with automatic flush on shutdown.

## Prerequisites

- Node.js 18 or newer
- A Doclight project with an API key

## Install

```bash
pnpm add @doclight/node
```

## Environment Variables

```bash
export DOCLIGHT_API_KEY="dl_your_key_here"
export DOCLIGHT_PROJECT_ID="proj_your_project_id"
```

## Code Changes

```ts
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
```

## Verification

1. Run the script with `DOCLIGHT_API_KEY` and `DOCLIGHT_PROJECT_ID` set.
2. Confirm it exits without error and prints no transport exceptions.
3. Check `getStats().sent` is at least `1` after `shutdown()`.

## Expected Dashboard Result

Within a few minutes you should see a new session titled **verify doclight install** with one `tool_called` event for tool **verify**.

## Common Errors

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `expected sent >= 1` | Invalid API key or unreachable endpoint | Verify `DOCLIGHT_API_KEY` and network access to ingest |
| Process hangs on exit | Missing `shutdown()` | Always `await client.shutdown()` before exit |
| No events in dashboard | Wrong `projectId` | Match `DOCLIGHT_PROJECT_ID` to your Doclight project |

## Do Not

- Do not log raw prompts, inputs, or outputs — Doclight v1 captures metadata only.
- Do not call `track()` after `shutdown()`.
- Do not disable lifecycle hooks in production unless you manage flush yourself.
