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

## Primitive schema compilation

Plugin setup now compiles every application schema into one private Drizzle
table catalog. Primitive scalars use their corresponding PostgreSQL types;
objects, JSON values, and lists of any depth use JSONB. Static defaults become
column metadata, while developer functions and framework timestamps remain
Runtime-owned and are never executed by the compiler.

```ts
import { createApplication } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres'
import {
	bigintField,
	dateTimeField,
	defineSchema,
	objectField,
	stringField,
} from '@ultimabase/schema'

const EventSchema = defineSchema({
	className: 'Event',
	fields: {
		title: stringField({ validation: { required: true } }),
		attendees: bigintField({ list: true }),
		metadata: objectField({
			fields: { publishedAt: dateTimeField() },
		}),
	},
})

const databaseUrl = process.env.DATABASE_URL

if (databaseUrl === undefined) {
	throw new TypeError('DATABASE_URL is required')
}

const application = await createApplication({
	schemas: [EventSchema],
	plugins: [postgresPlugin({ url: databaseUrl })],
})
```

At this stage `createApplication()` validates and compiles the schema without
opening the URL connection. The direct schema-policy issue will consume this
same catalog to create or synchronize real tables; developers will not write
Drizzle or SQL themselves.

Portable enums currently use `text` plus explicit enum metadata. Runtime owns
membership validation, which keeps enum-value changes independent from native
PostgreSQL enum migrations. Structured JSONB codecs preserve nested bigints,
binary values, and canonical temporal strings losslessly.

## Index compilation

Field and composite indexes use the storage-neutral Schema API:

```ts
const ArticleSchema = defineSchema({
	className: 'Article',
	fields: {
		authorId: stringField(),
		slug: stringField({ indexed: 'unique' }),
	},
	indexes: [
		{ fields: ['authorId', 'createdAt'] },
		{ fields: ['authorId', 'slug'], unique: true },
	],
})
```

PostgreSQL compiles these declarations into ordinary or unique Drizzle index
metadata during `createApplication()`. Physical names are deterministic,
collision-resistant, and limited to PostgreSQL's 63-byte identifier boundary.
The field tuple of every unique index remains available inside the adapter for
future upsert conflict targets; developers never import or name a Drizzle
index.

## Catalog introspection

The PostgreSQL package can now read a deterministic internal snapshot of live
tables, columns, defaults, identities, indexes, and constraints. Exact table
names from the compiled application catalog distinguish managed tables from
unrelated database structures.

Unsupported live features are reported explicitly to the upcoming schema
policy instead of being approximated. This includes views, foreign or
partitioned tables, unknown column types, generated columns, specialized
indexes, and unsupported constraint kinds.

There is intentionally no public introspection or Drizzle API. Direct schema
policies consume this snapshot automatically when `application.start()`
prepares the configured schemas.

## Direct schema policies

Without a migration plugin, `postgresPlugin` synchronizes registered schemas
through the `prepareSchema` lifecycle phase. The default `override` policy
creates missing tables and transactionally applies supported column, primary
key, default, identity, nullability, and index changes:

```ts
const application = await createApplication({
	schemas: [ArticleSchema],
	plugins: [
		postgresPlugin({
			url: databaseUrl,
			schemaPolicy: 'override',
		}),
	],
})

await application.start()
```

Use `fail` to inspect and reject any drift without mutation, or `ignore` to
skip structural inspection entirely. Direct synchronization preserves tables
outside the current application catalog because it has no migration history
with which to prove ownership. Unsupported structures on a managed table stop
`override` before its transaction rather than being approximated.

Renames are explicit and preserve the existing column data:

```ts
import { postgresColumn } from '@ultimabase/postgres'
import { stringField } from '@ultimabase/schema'

const title = stringField({
	extensions: [postgresColumn({ renamedFrom: 'headline' })],
})
```

An official migration plugin claims `postgresSchemaPreparationClaimName`
during setup. This suppresses direct synchronization so exactly one
database-specific implementation owns the preparation phase.

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
