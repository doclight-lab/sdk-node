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
        const body = await response.text()
        if (body.length > 0) {
          try {
            ingestBatchResponseSchema.safeParse(JSON.parse(body))
          } catch {
            // Flusher only needs ok: true; ignore malformed success bodies.
          }
        }
        return { ok: true }
      }

      const reason = `HTTP ${response.status}`
      if (
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500
      ) {
        return { ok: false, retryable: true, reason }
      }

      return { ok: false, retryable: false, reason }
    } catch (err) {
      const reason =
        err instanceof Error && err.name === "AbortError"
          ? "timeout"
          : String(err)
      return { ok: false, retryable: true, reason }
    } finally {
      clearTimeout(timer)
    }
  }
}
