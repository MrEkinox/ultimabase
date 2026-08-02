# @ultimabase/postgres

Official PostgreSQL database plugin using Drizzle internally and `pg` as the driver.

Responsibilities include schema, field, and query compilation; CRUD;
transactions; introspection; direct schema synchronization; indexes; and
database constraints. Permission behavior and ACL storage remain independent
plugins rather than PostgreSQL Runtime stages.

Without a migration plugin, `schemaPolicy` is `override`, `fail`, or `ignore`. No Drizzle type or builder is exported publicly.

## Connection lifecycle

The current implementation accepts either a connection URL or an existing
`pg`-compatible pool. Creating `UltimaBase` does not contact PostgreSQL;
`ultimabase.start()` verifies the connection and immediately returns the
borrowed client to the pool.

```ts
import {
	postgresConnectionServiceToken,
	postgresPlugin,
} from '@ultimabase/postgres'
import { UltimaBase } from '@ultimabase/core'

const databaseUrl = process.env.DATABASE_URL

if (databaseUrl === undefined) {
	throw new TypeError('DATABASE_URL is required')
}

const ultimabase = new UltimaBase({
	schemas: [],
	plugins: [postgresPlugin({ url: databaseUrl })],
})

await ultimabase.start()
const connection = ultimabase.application.getService(
	postgresConnectionServiceToken,
)
console.log(connection.state) // 'connected'
await ultimabase.dispose()
console.log(connection.state) // 'closed'
```

A pool created from `url` belongs to the application and is closed during
shutdown. An injected pool remains owned by the developer:

```ts
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const ultimabase = new UltimaBase({
	schemas: [],
	plugins: [postgresPlugin({ pool })],
})

await ultimabase.start()
await ultimabase.dispose()
await pool.end()
```

Connection URLs, driver messages, and raw pools are excluded from plugin
metadata and framework errors. Drizzle and concrete `pg` runtime objects are
not re-exported by this package.

## Internal database adapter

Plugin setup wraps the configured query client with Drizzle and registers
Runtime's `databaseAdapterServiceToken`. This means an application using
`postgresPlugin` is assembled automatically by the `UltimaBase` facade. The
lower-level engine remains available for transports and advanced composition:

```ts
const framework = ultimabase.engine
```

The Drizzle client remains inside `@ultimabase/postgres`; neither plugin exports
nor public declarations expose it. Pool clients borrowed for future
transactions use the same internal wrapper.

Singular CRUD operations and explicit Runtime transactions execute through this
adapter. Bulk operations and upserts remain separate work; calling one of those
paths reports an explicit not-yet-implemented framework error rather than
pretending that data was persisted.

Every adapter request carries Core's policy-neutral `constraints` array.
Adapter integration plugins register exact kind-and-version compilers during
application setup. PostgreSQL combines every resulting predicate with the
developer query using parameterized logical `AND`:

```ts
import { definePlugin } from '@ultimabase/core'
import { postgresConstraintCompiler } from '@ultimabase/postgres'

const tenantRows = postgresConstraintCompiler({
	kind: 'tenant.rows',
	version: 1,
	decode: (payload) => {
		if (
			typeof payload !== 'object' ||
			payload === null ||
			!('tenantId' in payload) ||
			typeof payload.tenantId !== 'string'
		) {
			throw new TypeError('Invalid tenant constraint payload')
		}

		return { tenantId: payload.tenantId }
	},
	compile: ({ field, payload, sql }) =>
		sql`${field('tenantId')} = ${payload.tenantId}`,
})

const tenantPostgresPlugin = definePlugin({
	name: 'example.tenant-postgres',
	setup: ({ constraintCompilers }) => {
		constraintCompilers.register(tenantRows)
	},
})
```

The callback cannot access Drizzle or return or interpolate raw SQL objects.
The safe tag accepts code-owned static SQL fragments, `field()` resolves one
logical schema field, and every portable dynamic interpolation becomes a driver
parameter. SQL-like objects and class instances fail closed before Drizzle can
interpret them. Unknown kinds, unsupported versions, invalid payloads, and
invalid compiler results fail before database execution.
Constraints are applied to reads, mutation targets, `FOR UPDATE` locks, and the
final prepared update or delete statement. Row constraints on create operations
fail closed because an insert has no existing target row to restrict.

## Transactions

An explicit Runtime transaction borrows one PostgreSQL client for its complete
lifetime. Every query issued through the callback engine uses that client;
successful callbacks commit, rejected callbacks roll back, and the client is
always returned or destroyed before the transaction completes:

```ts
import { requestSources } from '@ultimabase/core'

const request = ultimabase.engine.anonymous({
	requestId: 'publish-post',
	source: requestSources.internal,
})

const post = await request.transaction(async (transaction) => {
	return transaction.query(PostSchema).create({ title: 'Atomic post' })
})
```

Nested explicit transactions remain unsupported because the portable Runtime
contract does not imply PostgreSQL savepoints. Automatic transaction ownership
for every mutation is introduced separately by Core issue 329.

Inside that transaction, singular mutations use Core's prepared-mutation
protocol. Creates defer their write until the prepared handle executes. Updates
and deletes first lock one deterministic full target, then write by its retained
identifier and return two separate views: the developer's exact selection and a
private complete logical materialization for native field hooks. Handles are
single-use and expire with their borrowed transaction client.

Bulk and upsert preparation remains part of the dedicated bulk/upsert issue;
their public methods continue to fail explicitly until that implementation is
available.

## Singular CRUD

After `ultimabase.start()` prepares the static schemas, a direct query can
create, read, filter, project, update, and delete PostgreSQL rows without SQL or
Drizzle in developer code:

```ts
const created = await ultimabase.query(ArticleSchema).create({
	title: 'Runtime to PostgreSQL',
})

const found = await ultimabase
	.query(ArticleSchema)
	.equalTo('id', created.id)
	.select('id', 'title')
	.first()

const updated = await ultimabase
	.query(ArticleSchema)
	.equalTo('id', created.id)
	.updateOne({ set: { title: 'Updated' } })

const deleted = await ultimabase
	.query(ArticleSchema)
	.equalTo('id', created.id)
	.deleteOne()
```

Runtime generates UUID v7 identifiers and automatic timestamps once; the
adapter persists those exact normalized values. `first`, `get`, `updateOne`,
and `deleteOne` return `null` when no row matches. Update and delete select their
deterministic first target inside the mutation statement, avoiding a separate
read race.

This public flow is implemented and covered by the root worker-isolated
Testcontainers scenario. PostgreSQL temporal text is normalized back to
Schema's canonical ISO representation before a result reaches developer code.
Bulk operations, upserts, and resumed opaque cursor tokens are not yet
executable. Explicit transactions are available for the implemented singular
operations.

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
	Schema,
	objectField,
	stringField,
} from '@ultimabase/core'

const EventSchema = new Schema({
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

This lower-level Core example deliberately runs declaration-only setup without
opening the URL connection. Regular applications use `new UltimaBase(...)` and
let `start()` compile, prepare, and connect through one lifecycle; developers
never write Drizzle or SQL themselves.

Portable enums currently use `text` plus explicit enum metadata. Runtime owns
membership validation, which keeps enum-value changes independent from native
PostgreSQL enum migrations. Structured JSONB codecs preserve nested bigints,
binary values, and canonical temporal strings losslessly.

## Index compilation

Field and composite indexes use the storage-neutral Schema API:

```ts
const ArticleSchema = new Schema({
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
const ultimabase = new UltimaBase({
	schemas: [ArticleSchema],
	plugins: [
		postgresPlugin({
			url: databaseUrl,
			schemaPolicy: 'override',
		}),
	],
})

await ultimabase.start()
```

Use `fail` to inspect and reject any drift without mutation, or `ignore` to
skip structural inspection entirely. Direct synchronization preserves tables
outside the current application catalog because it has no migration history
with which to prove ownership. Unsupported structures on a managed table stop
`override` before its transaction rather than being approximated.

Renames are explicit and preserve the existing column data:

```ts
import { postgresColumn } from '@ultimabase/postgres'
import { stringField } from '@ultimabase/core'

const title = stringField({
	extensions: [postgresColumn({ renamedFrom: 'headline' })],
})
```

An official migration plugin claims `postgresSchemaPreparationClaimName`
during setup. This suppresses direct synchronization so exactly one
database-specific implementation owns the preparation phase.

## Query filter compilation

The internal adapter compiles the normalized `Query` filter tree through
Drizzle. Equality, ordered comparisons, membership, string matching, regular
expressions, existence, and nested `and`/`or`/`not` expressions share the same
parameterized boundary:

```ts
const query = new Query(ArticleSchema)
	.equalTo('status', 'published')
	.greaterThan('views', 1_000)
	.contains('title', 'Ultima_100%')
	.matches('slug', {
		flags: ['case-insensitive'],
		source: '^release-[0-9]+$',
	})
```

Developer values and regex sources never become SQL text. `contains`,
`startsWith`, and `endsWith` escape PostgreSQL `LIKE` wildcards (`%`, `_`) and
the escape character, so they retain literal substring semantics.

Regex uses PostgreSQL advanced regular expressions. `case-insensitive` selects
`~*`; the compiler maps the independent JavaScript-style `multiline` and
`dot-matches-newline` flags to PostgreSQL newline modes `n`, `s`, `w`, or `p`.
Invalid regex syntax is reported by PostgreSQL when the query executes. String
ordering comparisons use the database column's configured collation. See the
[PostgreSQL pattern-matching reference](https://www.postgresql.org/docs/current/functions-matching.html)
for the underlying ARE syntax.

This compiler remains internal until the CRUD adapter issue consumes it;
developers continue to build filters only through `Query`.

## Query selection and pagination compilation

The internal adapter also compiles projections, ordering, limits, offsets, and
forward cursor positions. Explicit selections load only their columns. Cursor
pages always append `id` as a deterministic UUID tie-breaker and use explicit
null placement, so equal developer sort values remain stable:

```ts
const firstPage = new Query(ArticleSchema)
	.select('id', 'title', 'createdAt')
	.descending('createdAt')
	.limit(25)
	.after()

const nextPage = firstPage.after(cursor)
```

`.after()` selects cursor pagination for the first page; `.after(cursor)`
resumes a later page. The opaque token is authenticated and checked through
Query's cursor contract before PostgreSQL receives its payload. Ordered values
then pass through the compiled field codecs and Drizzle parameters rather than
being interpolated into SQL.

This compiler is internal until the singular CRUD issue consumes it. Today the
example describes the implemented Query and compilation contract, not yet a
database-executable terminal.

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
import { Schema, stringField } from '@ultimabase/core'

const ArticleSchema = new Schema({
	className: 'Article',
	fields: {
		title: stringField(),
	},
	extensions: [postgresTable({ name: 'ContentItems-v2' })],
})
```

The explicit name is preserved verbatim. It is passed to Drizzle as an
identifier and escaped there, never interpolated into raw SQL. The generic
extension keeps `@ultimabase/core` independent from PostgreSQL; configuring
it without `postgresPlugin` fails application setup.
