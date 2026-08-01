# @ultimabase/postgres

Official PostgreSQL database plugin using Drizzle internally and `pg` as the driver.

Responsibilities include schema, field, query, and access-rule compilation; CRUD; transactions; introspection; direct schema synchronization; indexes; constraints; and ACL storage support.

Without a migration plugin, `schemaPolicy` is `override`, `fail`, or `ignore`. No Drizzle type or builder is exported publicly.

## Connection lifecycle

The current implementation accepts either a connection URL or an existing
`pg`-compatible pool. Creating the application does not contact PostgreSQL;
`application.start()` verifies the connection and immediately returns the
borrowed client to the pool.

```ts
import { createApplication } from '@ultimabase/core'
import {
	postgresConnectionServiceToken,
	postgresPlugin,
} from '@ultimabase/postgres'

const databaseUrl = process.env.DATABASE_URL

if (databaseUrl === undefined) {
	throw new TypeError('DATABASE_URL is required')
}

const application = await createApplication({
	schemas: [],
	plugins: [postgresPlugin({ url: databaseUrl })],
})
const connection = application.getService(postgresConnectionServiceToken)

console.log(connection.state) // 'idle'
await application.start()
console.log(connection.state) // 'connected'
await application.dispose()
console.log(connection.state) // 'closed'
```

A pool created from `url` belongs to the application and is closed during
shutdown. An injected pool remains owned by the developer:

```ts
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const application = await createApplication({
	schemas: [],
	plugins: [postgresPlugin({ pool })],
})

await application.start()
await application.dispose()
await pool.end()
```

Connection URLs, driver messages, and raw pools are excluded from plugin
metadata and framework errors. Drizzle and concrete `pg` runtime objects are
not re-exported by this package.

## Internal database adapter

Plugin setup wraps the configured query client with Drizzle and registers
Runtime's `databaseAdapterServiceToken`. This means an application using
`postgresPlugin` can already assemble its framework engine without manually
providing an adapter:

```ts
import { createFrameworkEngine } from '@ultimabase/runtime'

const framework = createFrameworkEngine(application)
```

The Drizzle client remains inside `@ultimabase/postgres`; neither plugin exports
nor public declarations expose it. Pool clients borrowed for future
transactions use the same internal wrapper.

Operation compilers, CRUD execution, and Runtime transactions are implemented
by the following PostgreSQL issues. Until then, calling an operation reports an
explicit not-yet-implemented framework error rather than pretending that data
was persisted.

## Table names

PostgreSQL owns physical naming. Without an override, class names use standard
English inflection and plural `snake_case`:

```text
BlogPost → blog_posts
Person   → people
Category → categories
```

Use `postgresTable` when the database needs an exact identifier:

```ts
import { postgresTable } from '@ultimabase/postgres'
import { defineSchema, stringField } from '@ultimabase/schema'

const ArticleSchema = defineSchema({
	className: 'Article',
	fields: {
		title: stringField(),
	},
	extensions: [postgresTable({ name: 'ContentItems-v2' })],
})
```

The explicit name is preserved verbatim. It is passed to Drizzle as an
identifier and escaped there, never interpolated into raw SQL. The generic
extension keeps `@ultimabase/schema` independent from PostgreSQL; configuring
it without `postgresPlugin` fails application setup.
