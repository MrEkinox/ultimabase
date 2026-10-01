# @ultimabase/postgres-plugin

Official PostgreSQL database plugin using Drizzle internally and `pg` as the driver.

Responsibilities include schema, field, and query compilation; CRUD;
transactions; introspection; direct schema synchronization; indexes; and
database constraints. Permission behavior and ACL storage remain independent
plugins rather than PostgreSQL Runtime stages.

The explicit `schemaPolicy` is `override`, `fail`, or `ignore`. No Drizzle type or builder is exported publicly.

The plugin declares `environment:network` because it creates or drives
PostgreSQL pools and connections directly. Applications may deny that claim
before plugin declaration or connection work. It is deliberately not a network
privilege: Core exposes no network facade and does not claim to sandbox the
in-process driver.

It requests `schema:declare` to own the direct `postgres` schema and field
options, and `adapter:consume` to compile protected database constraints. The
options are recognized only when `postgresPlugin()` is installed; unknown keys
and empty identifiers fail static application compilation.

The configured factory projects the schema-level `postgres.table` and stored
field `postgres.renamedFrom` options directly from the installed plugin without
Typegen. Embedded properties, virtual wrappers, and output descriptors have no
independent physical column identity, so the option is absent in those contexts
and Core rejects stale or untyped declarations before connection setup.

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

const Application = UltimaBase.use(postgresPlugin({ url: databaseUrl }))
const ultimabase = new Application({
	schemas: [],
})

await ultimabase.start()
const connection = ultimabase.plugin(postgresPluginName).connection
console.log(connection.state) // 'connected'
await ultimabase.dispose()
console.log(connection.state) // 'closed'
```

A pool created from `url` belongs to the application and is closed during
shutdown. An injected pool remains owned by the developer:

```ts
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const Application = UltimaBase.use(postgresPlugin({ pool }))
const ultimabase = new Application({
	schemas: [],
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
`postgresPlugin` is assembled automatically by the `UltimaBase` facade. Trusted
server code opens explicit request scopes directly from that facade.

Transports use Core's narrow application request execution capability; they
never receive this engine or the PostgreSQL adapter.

The Drizzle client remains inside `@ultimabase/postgres-plugin`; neither plugin exports
nor public declarations expose it. Pool clients borrowed for
transactions use the same internal wrapper.

Singular CRUD, bulk operations, upserts, and explicit Runtime transactions
execute through this adapter. Every mutation uses Runtime's transaction-bound
prepared-operation protocol; no bulk item opens a side transaction.

The adapter also compiles Core owner-private collection descriptors into hashed,
owner-and-instance-stable tables. They participate in desired schema preparation
and use PostgreSQL unique indexes plus `RESTRICT` or `CASCADE` foreign keys
toward public schema IDs, but remain absent from the public schema catalog and
Drizzle relational query surface. Private reads execute on the active request
client; mutations use the same borrowed client and transaction as ordinary
Runtime writes. Package upgrades retain physical table identity, while removed
collections remain inert orphaned storage for explicit migration review rather
than being dropped implicitly.

The execution protocol is a closed discriminated union of exact unique lookup,
insert, exact update, exact delete, and compare-and-swap. PostgreSQL does not
receive a private filter AST, scan, bulk mutation, relation loader, or migration
command through this boundary.

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

The adapter also advertises Core persistence-plan protocol version 2. It locks
mutation targets from the canonical logical plan, then executes the final
physical plan on the same borrowed client. An authorized delete-to-update
rewrite therefore issues one constrained tombstone `UPDATE` while Runtime hooks,
materializations, results, events, and transaction policy retain delete
semantics. PostgreSQL rejects unsupported versions, statement kinds, target
schemas, and result correlations before or inside the protected execution
boundary.

## Adapter bridge capabilities

`postgresPlugin` advertises PostgreSQL support separately for portable JSON
value codecs, opaque constraints, persistence-plan kinds and physical schema.
A logical plugin can require the corresponding neutral Core token without
importing this package. PostgreSQL owns Drizzle compilation, physical column
types and database effects.

Database-specific bridge plugins contribute columns with
`postgresPhysicalColumn()` under `adapter:consume`. The setup export exposes
Core-attributed immutable snapshots at `adapterMetadata.physicalSchema`,
including the actual plugin/instance identity, package/protocol versions,
contribution ID, normalized options and payload. Direct preparation compiles
these columns into desired state without changing their provenance.

ADR-0266 removes `postgresUpgrade()`, the migration contribution protocol and
`adapterMetadata.migrations`; no migration planner or history is shipped.
Physical metadata and direct synchronization remain available.

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
import { contributeApplication, plugin } from '@ultimabase/core'
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

const tenantPostgresPlugin = plugin({
	id: 'example.tenant-postgres',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		contributeApplication(({ constraintCompilers }) => {
			constraintCompilers.register(tenantRows)
			return { exports: undefined }
		}),
	],
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

const request = ultimabase.anonymous({
	requestId: 'publish-post',
	source: requestSources.internal,
})

const post = await request.transaction(async () => {
	return PostSchema.createOne({ data: { title: 'Atomic post' } })
})
```

Nested explicit transactions remain unsupported because the portable Runtime
contract does not imply PostgreSQL savepoints. Core owns one automatic
transaction for every mutation and its nested database work.

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
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined) throw new TypeError('DATABASE_URL is required')

const Application = UltimaBase.use(hooksPlugin()).use(
	postgresPlugin({ url: databaseUrl }),
)
const AuditSchema = Application.Schema.define({
	className: 'Audit',
	fields: (field) => ({
		action: field.string({ required: true }),
	}),
})

const ArticleSchema = Application.Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string({ required: true }),
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

const ultimabase = new Application({
	schemas: [ArticleSchema, AuditSchema],
})
```

If a later business handler fails, PostgreSQL rolls back the audit row and primary
row together. Named events are released only after a successful outer commit.
The Docker-backed
[`hooks-plugin-postgres.postgres.e2e.test.ts`](../hooks-plugin/tests/e2e/hooks-plugin-postgres.postgres.e2e.test.ts)
public-package suite verifies this behavior alongside plugin ordering, opaque
scope constraints, read restrictions, output resolution, and atomic itemized
batch semantics.

## CRUD, bulk, and upsert execution

After `ultimabase.start()` prepares the static schemas, Query handles reads and
the schema class handles writes without SQL or Drizzle in developer code.
Direct class commands resolve the sole active application:

```ts
const created = await ArticleSchema.createOne({
	data: { title: 'Runtime to PostgreSQL' },
	select: { id: true, title: true },
})

const found = await ultimabase
	.query(ArticleSchema)
	.where({ id: { eq: created.id } })
	.select({ id: true, title: true })
	.findOne()

const updated = await ArticleSchema.updateOne({
	where: { id: { eq: created.id } },
	data: { title: 'Updated' },
})

const deleted = await ArticleSchema.deleteOne({
	where: { id: { eq: created.id } },
	select: { id: true, title: true },
})
```

Inclusive `between(field, lower, upper)` and inverse `notBetween(...)` Query
nodes compile to PostgreSQL range predicates with both bounds retained as
driver parameters.

Runtime generates UUID v7 identifiers and automatic timestamps once; the
adapter persists those exact normalized values. Adapter-level singular reads
and writes return `null` when no row matches; Core applies the public command's
missing-target contract. Strict schema mutations fail with `NOT_FOUND`.
Prepared updates and deletes lock their selected target before writing through
its retained identity on the same transaction client.

This public flow is implemented and covered by the root worker-isolated
Testcontainers scenario. PostgreSQL temporal text is normalized back to
Schema's canonical ISO representation before a result reaches developer code.
Bulk operations and unique-target upserts are executable. Results preserve
developer input order. Update-many and delete-many schema commands prepare one
unique target at a time, expose the locked visible object to Access and
`resolveInput`, and use Drizzle writes with `returning()` for the requested
columns. Their default projection contains only `id`; a missing target aborts
the shared transaction with `NOT_FOUND`.

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
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const EventSchema = UltimaBase.Schema.define({
	className: 'Event',
	fields: (field) => ({
		title: field.string({ required: true }),
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

const Application = UltimaBase.use(postgresPlugin({ url: databaseUrl }))
const application = await new Application({
	schemas: [EventSchema],
}).initialize()
```

This Core example deliberately runs setup without
opening the URL connection. Regular applications use `new Application(...)` and
let `start()` compile, prepare, and connect through one lifecycle; developers
never write Drizzle or SQL themselves.

Portable enums currently use `text` plus explicit enum metadata. Runtime owns
membership validation, which keeps enum-value changes independent from native
PostgreSQL enum migrations. Native Drizzle columns handle compatible values
such as `bytea`, `time`, and string-mode `timestamp`. One client-level custom
Drizzle codec normalizes raw PostgreSQL temporal text, while the record
boundary detaches native `bytea` buffers and verifies field-specific scalar
invariants after Drizzle mapping. Custom columns are reserved for field-dependent
logical differences such as pointer identity and typed JSONB; nested bigints and
binary values remain lossless.

Decimal shape is compiled exclusively from Core's direct field metadata:
`field.decimal()` uses `numeric`, `{ precision: 12 }` uses `numeric(12)`, and
`{ precision: 12, scale: 2 }` uses `numeric(12, 2)`. PostgreSQL never inspects
the field's application validator to choose physical storage. Introspection,
desired-schema synchronization, and change planning preserve the resulting
numeric type verbatim.

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
const ArticleSchema = UltimaBase.Schema.define({
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
metadata during `UltimaBase.compile()`. Physical names are deterministic,
collision-resistant, and limited to PostgreSQL's 63-byte identifier boundary.
The field tuple of every unique index becomes the exact upsert conflict target;
developers never import or name a Drizzle index.
If a concurrent insert collides on another unique index, the adapter rechecks
only the declared target before choosing the update branch. An unrelated
conflict fails instead of updating a row selected by that other index.

## Catalog introspection

The PostgreSQL package can now read a deterministic internal snapshot of live
tables, columns, defaults, identities, indexes, and constraints. Exact table
names from the compiled application catalog distinguish managed tables from
unrelated database structures.

Unsupported live features are reported explicitly to the selected schema
policy instead of being approximated. This includes views, foreign or
partitioned tables, unknown column types, generated columns, specialized
indexes, and unsupported constraint kinds.

There is intentionally no public introspection or Drizzle API. Direct schema
policies consume this snapshot automatically when `application.start()`
prepares the configured schemas.

## Direct schema policies

`postgresPlugin` synchronizes registered schemas according to `schemaPolicy`
through the `prepareSchema` lifecycle phase. The default `override` policy
creates missing tables and transactionally applies supported column, primary
key, default, identity, nullability, and index changes:

```ts
const Application = UltimaBase.use(
	postgresPlugin({
		url: databaseUrl,
		schemaPolicy: 'override',
	}),
)
const ultimabase = new Application({
	schemas: [ArticleSchema],
})

await ultimabase.start()
```

The desired physical state is normalized from the same private Drizzle tables
used for query execution. UltimaBase adds only explicit transition metadata,
such as `renamedFrom`, before comparing that state with the live PostgreSQL
catalog.

Use `fail` to inspect and reject any drift without mutation, or `ignore` to
skip structural inspection entirely. Direct synchronization preserves tables
outside the current application catalog and unmatched columns inside managed
tables because it has no migration history with which to prove ownership.
Physical removal therefore requires an explicit migration; deleting an
application field or uninstalling its contributing plugin never infers a
destructive `DROP COLUMN`. Unsupported structures on a managed table stop
`override` before its transaction rather than being approximated.

Renames are explicit direct field options and preserve existing column data:

```ts
import { Application } from './application.js'

const ArticleSchema = Application.Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string({
			postgres: { renamedFrom: 'headline' },
		}),
	}),
})
```

The former `postgresSchemaPreparationCapability` marker and its type are
removed by ADR-0266. Direct preparation always follows `schemaPolicy`; use
existing `ignore` when external tooling manages the schema. No migration
runner or replacement preparation claim is installed. `renamedFrom` remains
part of direct synchronization and preserves data as shown above.

## Pointer storage

Portable Core pointers compile to PostgreSQL UUID columns and named foreign
keys. The logical field name remains the physical column name, while the
constraint name is deterministic and safe within PostgreSQL's identifier
limit. Optional pointers use nullable columns, while `required`, `indexed`, and
`indexed: "unique"` retain their normal Schema meaning. `onDelete` becomes
`RESTRICT`, `CASCADE`, or `SET NULL`.

```ts
import { UltimaBase } from '@ultimabase/core'

const User = UltimaBase.Schema.define({
	className: 'User',
	fields: (field) => ({
		name: field.string(),
	}),
})

const Post = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({
		author: field.pointer({
			target: () => User,
			required: true,
			indexed: true,
			onDelete: 'cascade',
		}),
	}),
})

const author = User.pointer('0198f090-2a50-7000-8000-000000000034')
const created = await Post.createOne(
	{ data: { author: { connect: author.id } } },
	{ ultimabase },
)
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

Nested singular writes reuse these same pointer columns, ordinary create and
update statements, and protected target reads. PostgreSQL receives no opaque
graph or adapter-specific nested command: Core schedules each operation on the
one borrowed transaction client. A nested target update can carry a private
relation scope, which PostgreSQL compiles into the target lock predicate before
running the ordinary scalar update. Owning membership reuses the relation
executor without issuing a redundant source-row update when the internal
operation contains only the edge delta; inverse-pointer membership remains an
ordinary target pointer update.

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

await tags.connect([firstTagId, secondTagId], {
	ultimabase,
})

const selected = await tags.findMany(
	{
		select: { id: true, label: true },
		orderBy: { label: 'asc' },
		limit: 20,
	},
	{ ultimabase },
)

await tags.set([featuredTagId], { ultimabase })
await tags.disconnect(featuredTagId, { ultimabase })
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
and constraints before the adapter receives that tree. A relation field's
declared `where` arrives only as Core's normalized private row filter and is
combined with the inclusion query before ordering and pagination. PostgreSQL
never receives the resolver or request context. No adapter-side DataLoader or
per-parent query loop is used. A nested `offset` is applied by Drizzle
independently to each parent collection.

Relation handle scopes stay outside the developer Query AST and are combined
with developer predicates and protected row filters using parameterized SQL.
Traversal first checks the source relation field, then runs the target read
through its ordinary policy and behavior pipeline. Mutations lock and update
the source inside the same Runtime transaction as their edge changes, so a
later behavior failure rolls back both. Duplicate connects are idempotent.

The private read filter never enters owning or inverse membership writes.
`connect`, `disconnect`, `set`, `clear`, and nested relationship commands alter
the physical edge selected by Core even when the target is excluded from the
next read. A requested mutation-result inclusion is a read and does apply the
filter. Grouped eager inclusions remain one relational `SELECT` rather than one
query per parent.

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
values, the relation field's Core-resolved `where`, target Access filters, and
plugin constraints remain parameters or private compiler input and never become
interpolated SQL text. The resolver and request context never reach PostgreSQL.

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
filters, the relation field's private declared filter, and plugin constraints
remain inside the correlated subquery, so hidden or non-matching targets are not
counted. All comparisons share one aggregate scan and compile through `HAVING`.
Owning joins, inverse joins, and inverse pointers still execute as one SQL
statement without loading related rows or issuing per-parent queries.

Relationships with business data remain ordinary schemas. For example, two
required pointers plus a composite unique index model a membership edge:

```ts
const Membership = UltimaBase.Schema.define({
	className: 'Membership',
	fields: (field) => ({
		member: field.pointer({
			onDelete: 'cascade',
			target: () => Member,
			required: true,
		}),
		project: field.pointer({
			onDelete: 'cascade',
			target: () => Project,
			required: true,
		}),
		role: field.string({ required: true }),
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

The internal adapter also compiles projections, ordering, limits, and offsets.
Explicit selections load only their columns. PostgreSQL preserves the exact
developer ordering and uses explicit null placement; it does not append an
implicit tie-breaker:

```ts
const orderedPage = new QueryBuilder(ArticleSchema)
	.select({ id: true, title: true, createdAt: true })
	.descending('createdAt')
	.limit(25)

const offsetPage = orderedPage.offset(50)
```

When a logical selection contains a Core virtual field, PostgreSQL receives
only Core's derived persisted returning selection. Overlapping dependencies are
already deduplicated in stable schema order and include the canonical `id`;
neither the virtual name nor its resolver or request context reaches Drizzle.
The same physical projection is used for reads, prepared mutation results, and
nested pointer or relation inclusions. Core resolves the virtual value and
removes dependency-only fields before application behavior or transport output.

Virtual declarations also contribute no Drizzle column, index, codec,
constraint, introspection entry, synchronization change, or migration drift.
Filtering and ordering remain limited to persisted fields and fail during Core
normalization before PostgreSQL compiles SQL.

`.offset()` selects offset pagination. Applications that need deterministic
ordering across equal values declare an additional unique term such as `id`.
Transport-specific cursors must be normalized before PostgreSQL receives the
ordinary Query AST.

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

Use the direct schema option when the database needs an exact identifier:

```ts
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined) throw new TypeError('DATABASE_URL is required')

const Application = UltimaBase.use(postgresPlugin({ url: databaseUrl }))
const ArticleSchema = Application.Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string(),
	}),
	postgres: { table: 'ContentItems-v2' },
})
```

The explicit name is preserved verbatim. It is passed to Drizzle as an
identifier and escaped there, never interpolated into raw SQL. The option is
declared and compiled entirely by `@ultimabase/postgres-plugin`, so Core remains
independent from PostgreSQL. Configuring it without `postgresPlugin()` fails
static application compilation.
