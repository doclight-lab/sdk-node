import {
  INGEST_BATCH_PATH,
  ingestBatchResponseSchema,
  type IngestBatchRequest,
  type Transport,
  type TransportResult,
} from "@doclight/core"

export interface HttpTransportOptions {
  apiKey: string
  endpoint: string
  fetch?: typeof globalThis.fetch
}

/**
 * Maps HTTP outcomes to TransportResult for the flusher retry loop.
 *
 * | Condition                              | Result                    |
 * |----------------------------------------|---------------------------|
 * | 2xx                                    | ok                        |
 * | 408, 429, 5xx                          | not ok, retryable         |
 * | Network error, abort, timeout          | not ok, retryable         |
 * | Other 4xx (400, 401, 413, …)           | not ok, not retryable     |
 * | 2xx with rejected > 0                  | not ok, not retryable     |
 *
 * Non-retryable 4xx means the payload or credentials will not fix themselves
 * on retry (bad JSON shape, invalid API key, batch too large).
 */
export class HttpTransport implements Transport {
  private readonly apiKey: string
  private readonly url: string
  private readonly fetchFn: typeof globalThis.fetch

  constructor(opts: HttpTransportOptions) {
    this.apiKey = opts.apiKey
    const base = opts.endpoint.replace(/\/$/, "")
    this.url = `${base}${INGEST_BATCH_PATH}`
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis)
  }

  async send(
    batch: IngestBatchRequest,
    opts: { timeoutMs: number },
  ): Promise<TransportResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs)

    try {
      const response = await this.fetchFn(this.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "x-doclight-sdk": `@doclight/node/${__DOCLIGHT_NODE_VERSION__}`,
        },
        body: JSON.stringify(batch),
        signal: controller.signal,
      })

      if (response.status >= 200 && response.status < 300) {
        return await this.interpretSuccess(response)
      }

      let reason = `HTTP ${response.status}`
      if (
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500
      ) {
        // The shared Transport contract cannot carry a retry delay, so a
        // bounded Retry-After is surfaced in the reason only; the core
        // flusher's own bounded backoff still applies.
        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"))
        if (retryAfterMs !== undefined) reason += ` (retry-after ${retryAfterMs}ms)`
        return { ok: false, retryable: true, reason: this.scrub(reason) }
      }

      return { ok: false, retryable: false, reason: this.scrub(reason) }
    } catch (err) {
      const reason =
        err instanceof Error && err.name === "AbortError"
          ? "timeout"
          : String(err)
      return { ok: false, retryable: true, reason: this.scrub(reason) }
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 2xx is only delivery when the backend did not reject events. A parseable
   * acknowledgement with rejected > 0 is a non-retryable failure (the same
   * events would be rejected again), never silent success. Empty or
   * unparseable 2xx bodies are treated as accepted for compatibility.
   */
  private async interpretSuccess(
    response: Response,
  ): Promise<TransportResult> {
    // A body read that stalls, disconnects or hits the timeout rejects here
    // and reaches send()'s catch as a retryable failure: the acknowledgement
    // was never received, so the batch must not be counted as delivered.
    const body = await response.text()
    if (body.length === 0) return { ok: true }

    let json: unknown
    try {
      json = JSON.parse(body)
    } catch {
      return { ok: true }
    }
    const ack = ingestBatchResponseSchema.safeParse(json)
    if (ack.success && ack.data.rejected > 0) {
      return {
        ok: false,
        retryable: false,
        reason: `rejected ${ack.data.rejected} event(s), accepted ${ack.data.accepted}`,
      }
    }
    return { ok: true }
  }

  private scrub(reason: string): string {
    return this.apiKey.length > 0
      ? reason.split(this.apiKey).join("[redacted]")
      : reason
  }
}

/** Upper bound for honoring a server-supplied Retry-After. */
export const MAX_RETRY_AFTER_MS = 30_000

/** Parses delta-seconds or HTTP-date; returns a value capped to MAX_RETRY_AFTER_MS. */
export function parseRetryAfterMs(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  let ms: number
  if (/^\d+$/.test(trimmed)) {
    ms = Number(trimmed) * 1000
  } else {
    const date = Date.parse(trimmed)
    if (Number.isNaN(date)) return undefined
    ms = date - now
  }
  return Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS)
}
