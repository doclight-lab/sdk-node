import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import type { AddressInfo } from "node:net"
import {
  ingestBatchRequestSchema,
  INGEST_BATCH_PATH,
  type IngestBatchRequest,
} from "@doclight/core"

export type MockIngestMode =
  | "success"
  | "500"
  | "429"
  | "400"
  | "401"
  | "timeout"

export interface MockIngestRequest {
  headers: IncomingMessage["headers"]
  body: string
  batch: IngestBatchRequest | undefined
}

export interface MockIngestServerOptions {
  expectedApiKey: string
  resolveMode: (requestIndex: number) => MockIngestMode
  timeoutDelayMs?: number
}

export class MockIngestServer {
  readonly requests: MockIngestRequest[] = []
  private server: Server | undefined
  private port = 0

  constructor(private readonly options: MockIngestServerOptions) {}

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  get requestCount(): number {
    return this.requests.length
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        void this.handle(req, res)
      })
      this.server.listen(0, "127.0.0.1", () => {
        const address = this.server!.address() as AddressInfo
        this.port = address.port
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.server) return
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => (err ? reject(err) : resolve()))
    })
    this.server = undefined
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (req.method !== "POST" || req.url !== INGEST_BATCH_PATH) {
      res.writeHead(404)
      res.end()
      return
    }

    const body = await readBody(req)
    const auth = req.headers.authorization
    const requestIndex = this.requests.length

    let batch: IngestBatchRequest | undefined
    if (auth === `Bearer ${this.options.expectedApiKey}`) {
      const parsed = ingestBatchRequestSchema.safeParse(JSON.parse(body))
      batch = parsed.success ? parsed.data : undefined
    }

    this.requests.push({ headers: req.headers, body, batch })

    const mode = this.options.resolveMode(requestIndex)

    if (auth !== `Bearer ${this.options.expectedApiKey}` || mode === "401") {
      res.writeHead(401, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: "unauthorized" }))
      return
    }

    const respond = (): void => {
      switch (mode) {
        case "success":
          res.writeHead(200, { "content-type": "application/json" })
          res.end(
            JSON.stringify({
              accepted: batch?.events.length ?? 0,
              rejected: 0,
            }),
          )
          break
        case "500":
          res.writeHead(500)
          res.end()
          break
        case "429":
          res.writeHead(429, { "content-type": "application/json" })
          res.end(JSON.stringify({ error: "rate limited" }))
          break
        case "400":
          res.writeHead(400, { "content-type": "application/json" })
          res.end(JSON.stringify({ error: "bad request" }))
          break
        case "timeout":
          res.writeHead(200, { "content-type": "application/json" })
          res.end(
            JSON.stringify({
              accepted: batch?.events.length ?? 0,
              rejected: 0,
            }),
          )
          break
      }
    }

    if (mode === "timeout") {
      setTimeout(respond, this.options.timeoutDelayMs ?? 2000)
      return
    }

    respond()
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}
