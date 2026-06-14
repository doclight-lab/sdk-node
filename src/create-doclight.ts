import {
  DEFAULT_INGEST_ENDPOINT,
  Doclight,
  type DoclightConfigInput,
} from "@doclight/core"
import { installLifecycleHooksOnce, registerClient } from "./lifecycle"
import { HttpTransport } from "./transport"

export type CreateDoclightConfig = DoclightConfigInput & {
  /** Register process lifecycle hooks (default true). */
  lifecycleHooks?: boolean
}

export function createDoclight(config: CreateDoclightConfig): Doclight {
  const { lifecycleHooks = true, ...schemaInput } = config
  const endpoint = schemaInput.endpoint ?? DEFAULT_INGEST_ENDPOINT

  const client = new Doclight({
    ...schemaInput,
    sender: new HttpTransport({
      apiKey: schemaInput.apiKey,
      endpoint,
    }),
    sdk: {
      name: "@doclight/node",
      version: __DOCLIGHT_NODE_VERSION__,
    },
  })

  if (lifecycleHooks) {
    registerClient(client)
    installLifecycleHooksOnce()
  }

  return client
}
