# @ultimabase/postgres-plugin

The official PostgreSQL database plugin: connection and pool management, schema
synchronization, transactions, integrity constraints and every query the Core
engine plans.

## Installation

```sh
npm install @ultimabase/postgres-plugin @ultimabase/core
```

`@ultimabase/core` is a peer dependency. You need a reachable PostgreSQL
database.

## Example

Configure it, from the tested
[`examples/postgres`](../../examples/postgres/README.md) application:

<!-- region ../../examples/postgres/src/database.ts#database -->

```ts
import process from 'node:process'

import { postgresPlugin } from '@ultimabase/postgres-plugin'

/**
 * The plugin creates and owns its pool from `DATABASE_URL`, read when the
 * application starts. Without `schemaPolicy`, `NODE_ENV=production` selects
 * `fail` and any other value `override`.
 */
export const database = postgresPlugin({
	connection: {
		max: 20,
		// TLS with the provider's certificate authority, when one is set.
		ssl:
			process.env.DATABASE_CA === undefined
				? false
				: { ca: process.env.DATABASE_CA },
		statementTimeoutMs: 5000,
		idleTimeoutMs: 30_000,
		// A database that is still starting, as in Docker Compose.
		connectRetries: 5,
	},
	// One `warn` line per slow statement, without its values.
	debug: { slowQueryMs: 500 },
})
```

<!-- endregion -->

## Documentation

- [PostgreSQL](../../apps/website/content/docs/1.0.0/plugins/official/postgresql.mdx)
- [Manual Installation](../../apps/website/content/docs/1.0.0/manual-installation.mdx)
- [Transactions](../../apps/website/content/docs/1.0.0/core/writing-data/transactions.mdx)
- [Troubleshooting](../../apps/website/content/docs/1.0.0/operations/troubleshooting.mdx)
