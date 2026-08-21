# @ultimabase/postgres-plugin

Official PostgreSQL database plugin using Drizzle internally and `pg` as the driver.

Responsibilities include schema, field, and query compilation; CRUD;
transactions; introspection; direct schema synchronization; indexes; and
database constraints. Permission behavior and ACL storage remain independent
plugins rather than PostgreSQL Runtime stages.

Without a migration plugin, `schemaPolicy` is `override`, `fail`, or `ignore`. No Drizzle type or builder is exported publicly.

The plugin declares `environment:network` because it creates or drives
PostgreSQL pools and connections directly. Applications may deny that claim
before plugin declaration or connection work. It is deliberately not a network
privilege: Core exposes no network facade and does not claim to sandbox the
in-process driver.

## Connection lifecycle

The current implementation accepts either a connection URL or an existing
`pg`-compatible pool. Creating `UltimaBase` does not contact PostgreSQL;
`ultimabase.start()` verifies the connection and immediately returns the
borrowed client to the pool.

```ts
import { postgresPlugin, postgresPluginName } from '@ultimabase/postgres-plugin'
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
const connection =
	ultimabase.application.getPlugin(postgresPluginName).connection
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

The plugin materializes Core's canonical `databaseAdapterCapability` from the
configured query client and keeps Drizzle private. This means an application using
`postgresPlugin` is assembled automatically by the `UltimaBase` facade. The
lower-level engine remains available for transports and advanced composition:

```ts
const framework = ultimabase.engine
```

The Drizzle client remains inside `@ultimabase/postgres-plugin`; neither plugin exports
nor public declarations expose it. Pool clients borrowed for future
transactions use the same internal wrapper.

Singular CRUD, bulk operations, upserts, and explicit Runtime transactions
execute through this adapter. Every mutation uses Runtime's transaction-bound
prepared-operation protocol; no bulk item opens a side transaction.

Core's canonical projection always selects `id`, even when application code
does not mention it. PostgreSQL therefore returns one visible stable identifier
on every root and nested model. Adapter-private identity metadata remains only
as a defensive correlation check for immutable commands and mutation
lifecycles; it no longer hides the identifier from hooks or serialized models.

Every adapter request carries Core's policy-neutral `constraints` array and an
optional framework-owned `rowFilter`. The latter contains protected policy
restrictions outside the developer Query, so product behaviors cannot inspect
or remove it. PostgreSQL compiles both channels and the developer predicate into
one parameterized `AND` expression.

The adapter also advertises Core persistence-plan protocol version 1. It locks
mutation targets from the canonical logical plan, then executes the final
physical plan on the same borrowed client. An authorized delete-to-update
rewrite therefore issues one constrained tombstone `UPDATE` while Runtime hooks,
materializations, results, events, and transaction policy retain delete
semantics. PostgreSQL rejects unsupported versions, statement kinds, target
schemas, and result correlations before or inside the protected execution
boundary.

## Adapter bridge capabilities

`postgresPlugin` advertises PostgreSQL support separately for portable JSON
value codecs, opaque constraints, persistence-plan kinds, physical schema, and
migration intent. A logical plugin can require the corresponding neutral Core
token without importing this package. PostgreSQL remains the package that owns
Drizzle compilation, physical column types, and database effects.

PostgreSQL-specific bridge packages may contribute columns with
`postgresPhysicalColumn()` and explicit upgrade intent with
`postgresUpgrade()`. The first requires `adapter:consume`; the second requires
the separate `migration:contribute` privilege. The PostgreSQL setup export
exposes their Core-attributed, immutable metadata at `adapterMetadata` so a
database migration implementation receives the real plugin ID, optional
instance ID, package version, protocol version, contribution ID, and normalized
static options. Direct schema preparation compiles current physical column
contributions into PostgreSQL desired state; migration intent remains inert
metadata until a migration owner reviews and applies it.

Adapter-specific queries require the nominal
`postgresRawAdapterCapability` and `adapter:raw`. The setup lease reports only
the inert PostgreSQL dialect identity. Inside a transaction-required operation,
the lease exposes a parameterized `query()` facade backed by the same borrowed
client as Runtime:

```ts
const rawPostgres = requireCapability(postgresRawAdapterCapability, '^1.0.0')

execute: ({ adapters }) =>
	adapters.withRaw(rawPostgres, async (postgres) => {
		if (postgres.scope !== 'transaction') return
		await postgres.query('SELECT pg_advisory_xact_lock($1)', [lockId])
	})
```

The facade is revoked when the callback settles, commits and rollbacks remain
owned by Runtime, and neither `pg.Pool`, `PoolClient`, Drizzle, Master authority,
nor a portable raw SQL API is exposed.

Adapter integration plugins register exact kind-and-version compilers during
application setup. PostgreSQL combines every resulting predicate with the
developer query using parameterized logical `AND`:

```ts
import { definePlugin } from '@ultimabase/core'
import { postgresConstraintCompiler } from '@ultimabase/postgres-plugin'

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
	pluginId: 'example.tenant-postgres',
	version: '1.0.0',
	core: '^0.0.0',
	setup: ({ constraintCompilers }) => {
		constraintCompilers.register(tenantRows)
	},
})
```

When one policy has several accepted subject alternatives, `anyOf()` combines
opaque predicates without exposing their underlying SQL representation:

```ts
compile: ({ anyOf, field, payload, sql }) =>
	anyOf(
		sql`${field('ownerId')} = ${payload.principalId}`,
		sql`${field('visibility')} = ${'public'}`,
	)
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

Official ACL authorization and reference discovery use the same generic
plugin-field containment path. PostgreSQL compiles the field-owned operand
without importing or identifying the ACL plugin, so both packages remain
independently optional.

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

const post = await request.transaction(async () => {
	return PostSchema.createOne({ data: { title: 'Atomic post' } })
})
```

Nested explicit transactions remain unsupported because the portable Runtime
contract does not imply PostgreSQL savepoints. Automatic transaction ownership
for every mutation is introduced separately by Core issue 329.

Inside that transaction, singular mutations use Core's prepared-mutation
protocol. Creates defer their write until the prepared handle executes. Updates
and deletes first lock one deterministic full target, then write by its retained
identifier. Their private materializations remain complete even when the public
result is selected. Pointer and relation fields remain unloaded references.
Handles are single-use and expire with their borrowed transaction client.

Generated schema collection commands execute ordered singular prepared
operations on the same borrowed client. Every collection mutation is atomic,
so a missing target or any item, behavior, persistence, or finalization failure
rolls back the complete batch. The adapter retains low-level multi-row and
set-based AST support for internal capabilities; the official Hooks plugin does
not expose that path.

### Official Hooks plugin transactions

When installed, the official Hooks plugin runs schema, field, and contributed
behavior on the same borrowed PostgreSQL client as the primary mutation. A
handler may therefore start another typed query without receiving a pool,
Drizzle client, or explicit transaction:

```ts
import { Schema, UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined) throw new TypeError('DATABASE_URL is required')

const AuditSchema = Schema.define({
	className: 'Audit',
	fields: (field) => ({
		action: field.string({ validation: { required: true } }),
	}),
})

const ArticleSchema = Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
	}),
	hooks: {
		beforeOperation: {
			create: async ({ context, item }) => {
				await AuditSchema.createOne({
					data: { action: `create:${item.title}` },
				})
				context.emit('audit.created', { title: item.title })
			},
		},
	},
})

const ultimabase = new UltimaBase({
	schemas: [ArticleSchema, AuditSchema],
	plugins: [hooksPlugin(), postgresPlugin({ url: databaseUrl })],
})
```

If a later business handler fails, PostgreSQL rolls back the audit row and primary
row together. Named events are released only after a successful outer commit.
The Docker-backed
[`hooks-plugin-postgres.postgres.e2e.test.ts`](../../tests/e2e/hooks-plugin-postgres.postgres.e2e.test.ts)
public-package suite verifies this behavior alongside plugin ordering, opaque
scope constraints, read restrictions, output resolution, and atomic itemized
batch semantics.

## CRUD, bulk, and upsert execution

After `ultimabase.start()` prepares the static schemas, Query handles reads and
the generated schema class handles writes without SQL or Drizzle in developer
code:

```ts
const created = await ArticleSchema.createOne(
	{
		data: { title: 'Runtime to PostgreSQL' },
		select: { id: true, title: true },
	},
	{ ultimabase },
)

const found = await ultimabase
	.query(ArticleSchema)
	.where({ id: { eq: created.id } })
	.select({ id: true, title: true })
	.findOne()

const updated = await ArticleSchema.updateOne(
	{
		where: { id: { eq: created.id } },
		data: { title: 'Updated' },
	},
	{ ultimabase },
)

const deleted = await ArticleSchema.deleteOne(
	{
		where: { id: { eq: created.id } },
		select: { id: true, title: true },
	},
	{ ultimabase },
)
```

Inclusive `between(field, lower, upper)` and inverse `notBetween(...)` Query
nodes compile to PostgreSQL range predicates with both bounds retained as
driver parameters.

Runtime generates UUID v7 identifiers and automatic timestamps once; the
adapter persists those exact normalized values. `findOne`, `get`, `updateOne`,
and `deleteOne` return `null` when no row matches. Update and delete select their
deterministic first target inside the mutation statement, avoiding a separate
read race.

This public flow is implemented and covered by the root worker-isolated
Testcontainers scenario. PostgreSQL temporal text is normalized back to
Schema's canonical ISO representation before a result reaches developer code.
Bulk operations and unique-target upserts are executable. Results preserve
developer input order. Update-many and delete-many schema commands prepare one
unique target at a time, expose the locked visible object to Access and
`resolveInput`, and use Drizzle writes with `returning()` for the requested
columns. Their default projection contains only `id`; a missing target aborts
the shared transaction with `NOT_FOUND`. Resumed opaque cursor tokens are not
yet executable.

When `createOne`, `createMany`, `updateOne`, or `updateMany` requests an
`include`, PostgreSQL performs the scalar write first and reuses Drizzle's
relational query builder inside the same transaction. A singular command adds
one relationship projection query. A non-empty collection shares one grouped
`WHERE id IN (...)` projection across every result and restores declaration
order afterward. Without `include`, no projection query is added. Target-lock
reads required by item-oriented updates remain separate from that projection.

```ts
const imported = await ArticleSchema.createMany(
	{
		data: rows,
		select: { id: true, title: true },
	},
	{ ultimabase },
)

const article = await ArticleSchema.upsertOne(
	{
		where: { slug: { eq: 'runtime-postgres' } },
		create: { slug: 'runtime-postgres', title: 'Runtime + PostgreSQL' },
		update: { title: 'Runtime + PostgreSQL' },
		select: { id: true, title: true },
	},
	{ ultimabase },
)
```

## Primitive schema compilation

Plugin setup now compiles every application schema into one private Drizzle
table catalog. Primitive scalars use their corresponding PostgreSQL types;
objects, JSON values, and one-dimensional field lists use JSONB. Static defaults become
column metadata, while developer functions and framework timestamps remain
Runtime-owned and are never executed by the compiler.

```ts
import { createApplication } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { Schema } from '@ultimabase/core'

const EventSchema = Schema.define({
	className: 'Event',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
		attendees: field.bigint({ list: true }),
		metadata: field.object({
			fields: (field) => ({
				publishedAt: field.dateTime(),
			}),
		}),
	}),
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
PostgreSQL enum migrations. Native Drizzle columns handle compatible values
such as `bytea`, `time`, and string-mode `timestamp`. One client-level Drizzle
codec extension normalizes raw PostgreSQL temporal text, while the record
boundary detaches native `bytea` buffers and verifies field-specific scalar
invariants after Drizzle mapping. Custom columns are reserved for field-dependent
logical differences such as pointer identity and typed JSONB; nested bigints and
binary values remain lossless.

Plugin fields that declare Core's portable versioned JSON storage codec also
compile to JSONB without coupling this package to the plugin kind. A single
non-unique index on JSONB uses GIN; synchronization and introspection preserve
the method and repair method drift. Plugin fields without a portable codec
remain unsupported until a specialized adapter compiler handles them.

Scalar equality and membership filters for those fields use the same column
codec as inserts and updates. Logical operands are therefore encoded before
parameterized JSONB comparison without teaching PostgreSQL the plugin's kind.
When the field owner also declares Core's `structuralContains` protocol,
PostgreSQL compiles its already-snapshotted partial JSON operand to parameterized
JSONB `@>`. That operand deliberately bypasses the complete-value storage codec,
so a community field can expose a narrow containment surface without an
adapter-specific bridge. No ordering, inverse containment, key, path, JSONPath,
or domain-specific operator is inferred from JSONB storage.

## Index compilation

Field and composite indexes use the storage-neutral Schema API:

```ts
const ArticleSchema = Schema.define({
	className: 'Article',
	fields: (field) => ({
		authorId: field.string(),
		slug: field.string({ indexed: 'unique' }),
	}),
	indexes: [
		{ fields: ['authorId', 'createdAt'] },
		{ fields: ['authorId', 'slug'], unique: true },
	],
})
```

PostgreSQL compiles these declarations into ordinary or unique Drizzle index
metadata during `createApplication()`. Physical names are deterministic,
collision-resistant, and limited to PostgreSQL's 63-byte identifier boundary.
The field tuple of every unique index becomes the exact upsert conflict target;
developers never import or name a Drizzle index.

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

The desired physical state is normalized from the same private Drizzle tables
used for query execution. UltimaBase adds only explicit transition metadata,
such as `renamedFrom`, before comparing that state with the live PostgreSQL
catalog.

Use `fail` to inspect and reject any drift without mutation, or `ignore` to
skip structural inspection entirely. Direct synchronization preserves tables
outside the current application catalog because it has no migration history
with which to prove ownership. Unsupported structures on a managed table stop
`override` before its transaction rather than being approximated.

Renames are explicit and preserve the existing column data:

```ts
import { postgresColumn } from '@ultimabase/postgres-plugin'
import { stringField } from '@ultimabase/core'

const title = stringField({
	extensions: [postgresColumn({ renamedFrom: 'headline' })],
})
```

An official migration plugin provides the single declaration capability
`postgresSchemaPreparationCapability`. PostgreSQL then suppresses direct
synchronization so exactly one database-specific implementation owns the
preparation phase.

## Pointer storage

Portable Core pointers compile to PostgreSQL UUID columns and named foreign
keys. The logical field name remains the physical column name, while the
constraint name is deterministic and safe within PostgreSQL's identifier
limit. Optional pointers use nullable columns, while `required`, `indexed`, and
`indexed: "unique"` retain their normal Schema meaning. `onDelete` becomes
`RESTRICT`, `CASCADE`, or `SET NULL`.

```ts
import { Schema } from '@ultimabase/core'

const User = Schema.define({
	className: 'User',
	fields: (field) => ({
		name: field.string(),
	}),
})

const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		author: field.pointer({
			target: () => User,
			validation: { required: true },
			indexed: true,
			onDelete: 'cascade',
		}),
	}),
})

const author = User.pointer('0198f090-2a50-7000-8000-000000000034')
const created = await Post.createOne({ data: { author } }, { ultimabase })
const found = await Post.findOne(
	{
		where: {
			author: {
				eq: author.id,
				is: { name: { startsWith: 'A' } },
			},
		},
		include: { author: { select: { id: true, name: true } } },
	},
	{ ultimabase },
)
```

Identity predicates send only the target UUID as a parameter. `is` and `isNot`
compile through the generated Drizzle `one` relation with target Access inside
the correlated predicate. Reads restore
an immutable `Pointer` bound to the exact registered target schema. Inclusion
then executes through Core's nested operation pipeline, so target Access,
field output resolution, request authority, and the current transaction remain
enforced without manufacturing target schema read hooks. Direct
schema synchronization creates every table before foreign keys, which also
supports circular schema graphs.

## Relation storage

An owning `relationField` compiles to one deterministic hidden join table with
`source_id` and `target_id` UUID foreign keys. The pair is unique, each
traversal direction is indexed, and both foreign keys use cascade cleanup for
join rows only. Deleting either object therefore removes stale edges without
deleting the related object. An inverse relation reuses that same table with
the orientation reversed, or queries its declared `mappedBy` pointer column;
it never creates duplicate storage.

```ts
const tags = article.relation('tags')

await tags.connect([Tag.pointer(firstTagId), Tag.pointer(secondTagId)], {
	ultimabase,
})

const selected = await tags.findMany(
	{
		select: { id: true, label: true },
		orderBy: { label: 'asc' },
		limit: 20,
		cursor: true,
	},
	{ ultimabase },
)

await tags.set([Tag.pointer(featuredTagId)], { ultimabase })
await tags.disconnect(Tag.pointer(featuredTagId), { ultimabase })
await tags.clear({ ultimabase })
```

The same generated Drizzle relation graph supports collection inclusion on a
source read:

```ts
const articles = await Article.findMany({
	select: { id: true, title: true },
	include: {
		tags: {
			where: { label: { ne: 'archived' } },
			orderBy: { label: 'asc' },
			offset: 10,
			limit: 20,
			select: { id: true, label: true },
		},
	},
})
```

PostgreSQL compiles pointer, owning-relation, inverse-relation, and nested
inclusion branches into one Drizzle RQB `with` tree. Core prepares target policy
and constraints before the adapter receives that tree. No adapter-side
DataLoader or per-parent query loop is used. A nested `offset` is applied by
Drizzle independently to each parent collection.

Relation handle scopes stay outside the developer Query AST and are combined with
developer predicates and protected row filters using parameterized SQL. Traversal
first checks the source relation field, then runs the target read through its
ordinary policy and behavior pipeline. Mutations lock and update the source inside
the same Runtime transaction as their edge changes, so a later behavior failure
rolls back both. Duplicate connects are idempotent. `cursor: true` enables the
stable first cursor page; opaque cursor strings retain the same general
execution limitation documented above.

Source relation quantifiers compile to correlated `EXISTS` expressions without
loading target rows:

```ts
const articles = await Article.findMany({
	where: { tags: { some: { label: { eq: 'typescript' } } } },
})
```

Owning joins, inverse joins, and inverse pointers share the same compiler.
`none` negates a matching `EXISTS`; `every` rejects a visible related row that
does not satisfy the target predicate, which makes it true for an empty
relation. Nested predicates receive deterministic table aliases. Developer
values, target Access filters, and plugin constraints remain parameters or
private compiler input and never become interpolated SQL text.

Relation emptiness uses `isEmpty: true` and non-emptiness uses
`isNotEmpty: true`. Core normalizes those explicit flags to `none: {}` and
`some: {}`, preserving PostgreSQL's correlated `NOT EXISTS` and `EXISTS`
compilation. To-many relations have no nullable row column, so `isNull` and
`isNotNull` are not part of their filter contract.

Visible relation cardinality uses a correlated aggregate in the same parent
statement:

```ts
const establishedArticles = await Article.findMany({
	where: {
		tags: {
			count: {
				where: { label: { eq: 'typescript' } },
				gte: 3,
				lt: 100,
			},
		},
	},
})
```

Drizzle RQB v2 has no relation cardinality comparator, so PostgreSQL uses
Drizzle Core's aliased `QueryBuilder`, `count()`, joins, and parameterized
comparison helpers for this leaf. An optional target `where`, target Access
filters, and plugin constraints remain inside the correlated subquery, so
hidden or non-matching targets are not counted. All comparisons share one
aggregate scan and compile through `HAVING`. Owning joins, inverse joins, and
inverse pointers still execute as one SQL statement without loading related
rows or issuing per-parent queries.

Relationships with business data remain ordinary schemas. For example, two
required pointers plus a composite unique index model a membership edge:

```ts
const Membership = Schema.define({
	className: 'Membership',
	fields: (field) => ({
		member: field.pointer({
			onDelete: 'cascade',
			target: () => Member,
			validation: { required: true },
		}),
		project: field.pointer({
			onDelete: 'cascade',
			target: () => Project,
			validation: { required: true },
		}),
		role: field.string({ validation: { required: true } }),
	}),
	indexes: [{ fields: ['project', 'member'], unique: true }],
})
```

PostgreSQL compiles this into an ordinary edge table, two named foreign keys,
and one composite unique index. Direct edge queries, Access, hooks, and explicit
transactions continue through Core Runtime; no join-table API or adapter SQL
enters developer code. Implicit `relationField` storage remains preferable when
the edge has no independent data or lifecycle.

## Query filter compilation

The internal adapter compiles the normalized `Query` filter tree through
Drizzle. Equality, ordered comparisons, membership, string matching, regular
expressions, existence, and nested `and`/`or`/`not` expressions share the same
parameterized boundary:

```ts
const query = new QueryBuilder(ArticleSchema).where({
	status: { eq: 'published' },
	views: { gt: 1_000 },
	title: { contains: 'Ultima_100%' },
	slug: {
		matches: {
			flags: ['case-insensitive'],
			source: '^release-[0-9]+$',
		},
	},
})
```

Developer values and regex sources never become SQL text. `contains`,
`startsWith`, and `endsWith` escape PostgreSQL `LIKE` wildcards (`%`, `_`) and
the escape character, so they retain literal substring semantics.

One-dimensional field lists are stored as JSONB and compile their portable
`eq`, `ne`, `has`, `hasSome`, `hasEvery`, `isEmpty`, and null predicates through
parameterized JSONB comparisons and exact element predicates. The field storage
codec runs for every operand, so bigint, binary, enum, and typed object elements
preserve the same logical-to-driver mapping as persisted list values. Exact
element equality deliberately avoids JSONB containment's partial-object
semantics.

For `jsonField` and `objectField`, the same `contains` builder means structural
containment. PostgreSQL compiles the shared structured AST to JSONB operators;
typed object partials pass through child codecs before serialization:

```ts
import { fieldPath } from '@ultimabase/core'

const query = new QueryBuilder(ArticleSchema).where((where) =>
	where
		.contains('metadata', { visibility: 'public' }) // @>
		.containedBy('metadata', { visibility: 'public', featured: true }) // <@
		.hasAnyKeys('metadata', ['visibility', 'featured']) // ?|
		.eq(fieldPath('profile', ['contact', 'email']), 'ada@example.com') // #>
		.jsonPathExists('metadata', {
			source: '$.items[*] ? (@.price > $minimum)',
			variables: { minimum: 10 },
		}),
)
```

Containment documents, keys, key arrays, and path segment arrays are parameters.
The compiler uses `#>>` only for typed string matching and `#>` for JSONB value
comparisons. No public builder exposes PostgreSQL syntax or raw SQL.

Advanced JSONPath expressions without variables compile directly to
parameterized `@?` or `@@`, preserving PostgreSQL's JSONB index path. When
variables are supplied, the compiler uses `jsonb_path_exists` or
`jsonb_path_match` and sends the source and JSONB variables separately, with
silent structural-error handling enabled. JSONPath against an `objectField`
observes its encoded JSONB representation.

Regex uses PostgreSQL advanced regular expressions. `case-insensitive` selects
`~*`; the compiler maps the independent JavaScript-style `multiline` and
`dot-matches-newline` flags to PostgreSQL newline modes `n`, `s`, `w`, or `p`.
Invalid regex syntax is reported by PostgreSQL when the query executes. String
ordering comparisons use the database column's configured collation. See the
[PostgreSQL pattern-matching reference](https://www.postgresql.org/docs/current/functions-matching.html)
for the underlying ARE syntax.

The compiler remains internal; developers build every scalar and relation
filter only through canonical `where` objects or `QueryBuilder.where`.

## Query selection and pagination compilation

The internal adapter also compiles projections, ordering, limits, offsets, and
forward cursor positions. Explicit selections load only their columns. Cursor
pages always append `id` as a deterministic UUID tie-breaker and use explicit
null placement, so equal developer sort values remain stable:

```ts
const orderedPage = new QueryBuilder(ArticleSchema)
	.select({ id: true, title: true, createdAt: true })
	.descending('createdAt')
	.limit(25)

const firstPage = orderedPage.after()
const nextPage = firstPage.after(cursor)
const offsetPage = orderedPage.offset(50)
```

`.after()` selects cursor pagination for the first page; `.after(cursor)`
resumes a later page. `.offset()` selects offset pagination and cannot be
combined with `.after()`. The opaque token is authenticated and checked through
Query's cursor contract before PostgreSQL receives its payload. Ordered values
then stay logical until their Drizzle column maps the parameter, rather than
being interpolated into SQL or encoded by the cursor compiler.

The builder remains a non-executing utility. Schema-root read commands normalize
their canonical objects to the same AST before this compiler runs.

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
import { postgresTable } from '@ultimabase/postgres-plugin'
import { Schema } from '@ultimabase/core'

const ArticleSchema = Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string(),
	}),
	extensions: [postgresTable({ name: 'ContentItems-v2' })],
})
```

The explicit name is preserved verbatim. It is passed to Drizzle as an
identifier and escaped there, never interpolated into raw SQL. The generic
extension keeps `@ultimabase/core` independent from PostgreSQL; configuring
it without `postgresPlugin` fails application setup.
