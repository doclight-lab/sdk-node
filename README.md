# @doclight/node

Node.js HTTP transport and process lifecycle integration for Doclight. Depends on `@doclight/core` for schemas, client, queue, and flusher.

## Install

```bash
npm install @doclight/node
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DOCLIGHT_API_KEY` | yes | API key from the doclight.app dashboard |
| `DOCLIGHT_PROJECT_ID` | yes | Project ID from the doclight.app dashboard |
| `DOCLIGHT_ENDPOINT` | no | Override ingest endpoint (default: `https://ingest.doclight.app`) |

## Quickstart

```ts
import { createDoclight } from "@doclight/node"

const client = createDoclight({
  apiKey: process.env.DOCLIGHT_API_KEY!,
  projectId: process.env.DOCLIGHT_PROJECT_ID!,
})

const sessionId = client.startSession("checkout fix")
client.trackToolCall({ sessionId, toolName: "grep", status: "success", durationMs: 12 })
client.endSession(sessionId, "success")

await client.shutdown()
console.log("sent:", client.getStats().sent) // verify >= 1
```

`createDoclight()` wires `HttpTransport`, sets `sdk` to `@doclight/node/<version>`, and registers process lifecycle hooks by default.

## What is tracked / what is never tracked

| Tracked | Never tracked |
| --- | --- |
| Tool name, duration, outcome | Tool input arguments |
| Session ID, session goal | User messages or prompts |
| HTTP status codes | Request/response bodies |
| Error types and retry counts | API keys or credentials |
| Timing and counts | File contents or PII |

## HTTP transport

`POST {endpoint}/v1/events/batch` with JSON `IngestBatchRequest` body.

Production endpoint: `https://ingest.doclight.app`. For local development against the Python ingest service in `apps/api`, use `http://localhost:8787`.

Headers:

- `Authorization: Bearer <apiKey>`
- `Content-Type: application/json`
- `x-doclight-sdk: @doclight/node/<version>`

### Retryable status mapping

| HTTP outcome | Retryable |
| --- | --- |
| 2xx, empty/unparseable body or `rejected: 0` | — (success) |
| 2xx with `rejected > 0` | no (reported as a failed send, never as delivered) |
| 408 Request Timeout | yes |
| 429 Too Many Requests | yes |
| 5xx | yes |
| Network error / abort / timeout | yes |
| Other 4xx (400, 401, 413, …) | no |

Non-retryable 4xx means the payload or credentials will not fix themselves on retry.

### Delivery limits

- Retries, request timeout, queue size, drop policy and shutdown cap come from the `@doclight/core` flusher config; retries reuse the same batch, so event IDs are preserved. Delivery never throws into application code; failures are counted in `getStats()` and logged once without credentials.
- `Retry-After` is parsed and capped at 30s, but `@doclight/core` 0.1.0's `TransportResult` cannot carry a retry delay, so it is only included in the failure reason; the flusher's own bounded backoff applies.
- Partial acknowledgements (`accepted` and `rejected` both non-zero) are reported as a non-retryable failure of the whole batch because the core contract has no per-event result.
- The backend's final endpoint, credential-bound brand and acknowledgement semantics are still being agreed (see sdk-core#4 and aeo-visibility#101); this package follows the contract in the installed `@doclight/core`.

## Lifecycle hooks

By default `createDoclight()` registers hooks once per process:

- **`beforeExit`**: calls `shutdown()` on all clients created with hooks enabled
- **`SIGTERM` / `SIGINT`**: `await shutdown()` on all clients, then re-delivers the signal via `process.kill(process.pid, signal)` so the process still exits normally

Pass `lifecycleHooks: false` to opt out (recommended in tests).

## Advanced

```ts
import { HttpTransport, Doclight } from "@doclight/node"

const client = new Doclight({
  apiKey: "...",
  projectId: "...",
  sender: new HttpTransport({ apiKey: "...", endpoint: "https://ingest.doclight.app" }),
})
```

All `@doclight/core` types and exports are re-exported from this package.

## Source and issues

- Source: https://github.com/doclight-lab/sdk-node
- Issues: https://github.com/doclight-lab/sdk-node/issues

---

For MCP server instrumentation, see [@doclight/mcp](https://www.npmjs.com/package/@doclight/mcp).

[Full documentation →](https://doclight.app/docs)
