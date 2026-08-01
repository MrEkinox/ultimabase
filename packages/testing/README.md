# @ultimabase/testing

Testing utilities and conformance suites for framework applications and plugin authors.

## PostgreSQL worker isolation

`PostgresTestWorker` gives every Vitest fork a deterministic PostgreSQL schema
without depending on `pg` or Testcontainers:

```ts
import process from 'node:process'

import { PostgresTestWorker, readVitestPoolId } from '@ultimabase/testing'
import { Pool } from 'pg'

const adminPool = new Pool({ connectionString: databaseUrl })
const worker = new PostgresTestWorker({
	query: async (statement) => {
		await adminPool.query(statement)
	},
	workerId: readVitestPoolId(process.env.VITEST_POOL_ID),
})

await worker.reset()

const pool = new Pool({
	connectionString: databaseUrl,
	options: worker.connectionOptions,
})
```

`reset()` drops and recreates only `worker.schemaName`. `connectionOptions`
sets that schema as the pool's `search_path`. Close the worker pool before
calling `worker.dispose()`, then close the administrative pool.

The repository's PostgreSQL E2E project starts one Testcontainer globally and
shares only its connection URI. No mutable application, pool, container,
schema registry, or plugin instance is shared between Vitest workers.

Planned APIs still include `createTestApplication`, `runAs`, transport
executors, and broader adapter conformance suites.
