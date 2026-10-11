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

It requests `schema:declare` to own the `postgres` schema rule and field
option. Both are recognized only when `postgresPlugin()` is installed; unknown keys
and empty identifiers fail static application compilation.

The table name is a rule of the final `.with({ postgres: { table } })` call,
typed through Core's rules slot (ADR-0320), and the stored-field
`postgres.renamedFrom` option is projected directly from the installed plugin,
both without Typegen. Embedded properties, virtual wrappers, and output
descriptors have no independent physical column identity, so the field option
is absent in those contexts and Core rejects stale or untyped declarations
before connection setup. The former `define({ postgres: { table } })` form
still works at runtime and through Typegen until the old declaration form is
removed.

## Connection lifecycle

The plugin accepts a connection URL, an existing `pg`-compatible pool, or
neither: `postgresPlugin()` then reads the `DATABASE_URL` environment variable
when the application starts, not when the plugin is created, so schemas and
applications import and type-check without environment (ADR-0312). An
explicit `url` or `pool` always wins. A missing or empty variable fails
`start()` with a message naming `DATABASE_URL` and the `url` option, never the
value. Creating `UltimaBase` does not contact PostgreSQL; `ultimabase.start()`
verifies the connection and immediately returns the borrowed client to the
pool. `logLevel: 'debug'` logs where the connection comes from and the derived
`schemaPolicy` with its source, never the URL.

```ts
import { postgresPlugin, postgresPluginName } from '@ultimabase/postgres-plugin'
import { UltimaBase } from '@ultimabase/core'

const Application = UltimaBase.use(postgresPlugin())
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

### Connection settings

With `url` or `DATABASE_URL`, `connection` tunes the pool the plugin creates
(ADR-0320); an injected `pool` keeps its own settings and rejects `connection`.

```ts
postgresPlugin({
	connection: {
		max: 20, // pooled connections, default 10
		ssl: { ca: process.env.DATABASE_CA }, // or true; sslmode in the URL wins
		statementTimeoutMs: 5000, // cancels longer statements, default none
		idleTimeoutMs: 30_000, // closes idle connections, 0 keeps them, default 10 s
		connectRetries: 5, // first connection only, default 0
	},
})
```

`connectRetries` retries the verification of `start()` with growing delays
(0.5 s, 1 s, 2 s, 4 s, then 8 s), for a database that is still starting in
Docker or Kubernetes. Each failed attempt logs one `warn` line with the driver
code only. A cancelled statement fails with the driver code `57014`.

### Debugging

`debug` logs statements through the plugin logger, never their values:

```ts
postgresPlugin({ debug: { logQueries: true, slowQueryMs: 500 } })
```

`logQueries` writes one `info` line per statement with its duration and its
text with `$n` placeholders (`query 1.2 ms: select "id", "title" from "posts"
where "id" = $1`); `slowQueryMs` writes one `warn` line for each statement
that takes at least that many milliseconds and is cheap enough for production.
Schema synchronization statements are logged too; their DDL contains declared
static defaults and partial-index literals, never row values. `debug` applies
to every connection mode, injected pools included.

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

## Adapter boundaries

`postgresPlugin` implements Core's neutral `DatabaseAdapter` contract,
advertises `databasePersistencePlanCapability`, and compiles the protected row
filters that Runtime carries beside each request. PostgreSQL owns Drizzle
compilation, physical column types and database effects.

ADR-0266 removes `postgresUpgrade()`, the migration contribution protocol and
migration metadata; no migration planner or history is shipped. ADR-0289
removes the test-only adapter support providers, `postgresPhysicalColumn()`
physical-schema contributions with their `adapterMetadata` export, and the
`postgresRawAdapterCapability` raw lease, and `postgresConstraintCompiler()`
with the `adapter:consume` privilege. Direct synchronization remains
available, and neither `pg.Pool`, `PoolClient`, Drizzle, Master authority nor
a raw SQL API is exposed.

Protected row filters are combined with the developer query using
parameterized logical `AND` and applied to reads, mutation targets,
`FOR UPDATE` locks, and the final prepared update or delete statement. Row
filters on create operations fail closed because an insert has no existing
target row to restrict.

Official ACL authorization and reference discovery use the same generic
plugin-field containment path. PostgreSQL compiles the field-owned operand
without importing or identifying the ACL plugin, so both packages remain
independently optional.

## Transactions

An explicit Runtime transaction borrows one PostgreSQL client for its complete
lifetime. Every query issued in the callback uses that client; successful
callbacks commit, rejected callbacks roll back, and the client is always
returned or destroyed before the transaction completes:

```ts
const post = await ultimabase.transaction(() =>
	PostSchema.createOne({ data: { title: 'Atomic post' } }),
)
```

Nested explicit transactions remain unsupported because the portable Runtime
contract does not imply PostgreSQL savepoints. Core owns one automatic
transaction for every mutation and its nested database work.

Transactions run at `READ COMMITTED`. A serialization failure or deadlock
(SQLSTATE 40001 or 40P01, also when `COMMIT` reports it) becomes the retryable
`TRANSACTION_CONFLICT`: PostgreSQL has rolled the transaction back, and Core
replays an automatic mutation transaction at most three times (ADR-0300). An
explicit `transaction()` is never replayed. A unique violation (23505) becomes
`UNIQUE_VIOLATION`, whose public details name the logical schema and index
fields of the generated index; a foreign-key violation (23503) becomes
`REFERENCE_VIOLATION`, naming only the schema of the deleted or written row
(ADR-0302). Owner-private storage maps the same driver codes without public
details. Other data and integrity errors remain `VALIDATION_ERROR`.

`checkHealth(signal)` runs `SELECT 1` on the pool and backs
`ultimabase.health()`; the adapter exports no `ping()` helper.

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

const Application = UltimaBase.use(hooksPlugin()).use(postgresPlugin())
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
const imported = await ArticleSchema.createMany({
	data: rows,
	select: { id: true, title: true },
})

const article = await ArticleSchema.upsertOne({
	where: { slug: { eq: 'runtime-postgres' } },
	create: { slug: 'runtime-postgres', title: 'Runtime + PostgreSQL' },
	update: { title: 'Runtime + PostgreSQL' },
	select: { id: true, title: true },
})
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

const Application = UltimaBase.use(postgresPlugin())
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

A partial index declared with `where` (ADR-0303) compiles to
`CREATE [UNIQUE] INDEX ... WHERE <predicate>` with inline, escaped literals.
Its physical name includes a hash of the predicate, so synchronization replaces
an index whose predicate changed, and introspection records the live
predicate. The adapter declares the `partialIndexes` capability and every
built-in filter operator in `filterOperators` (ADR-0301).
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
through the `prepareSchema` lifecycle phase. When `schemaPolicy` is omitted,
the factory reads `NODE_ENV` once: `production` selects `fail`, so a deployed
application never alters its schema implicitly, and any other value selects
`override` ([ADR-0292](../../docs/adr/0292-environment-aware-postgres-schema-policy.md)).
An explicit `schemaPolicy` always wins. The `override` policy
creates missing tables and transactionally applies supported column, primary
key, default, identity, nullability, and index changes:

```ts
const Application = UltimaBase.use(
	postgresPlugin({
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

Under `override`, synchronization is safe by construction (ADR-0320):

- Each applied change logs one `info` line after the transaction commits, for
  example `schema change applied: add column "articles"."title" (text, optional)`.
- Only widening type conversions apply: a wider or unconstrained `numeric`,
  `bigint` to a `numeric` that holds it, or a finer `time`/`timestamp` of the
  same time-zone kind. Any other change, such as `double precision` to `text`
  after a `float` field became a `string`, refuses to start and points to a
  migration.
- A managed table that keeps a `NOT NULL` column without default that no field
  declares any more refuses to start, because every insert would fail. When a
  field of the same type appears in the same plan, the message suggests the
  forgotten `renamedFrom`; for an optional orphan column it is a `warn` line
  and the plan still applies.

Use `fail` to inspect and reject any drift without mutation, or `ignore` to
skip structural inspection entirely. Direct synchronization preserves tables
outside the current application catalog and unmatched columns inside managed
tables because it has no migration history with which to prove ownership.
Physical removal therefore requires an explicit migration; deleting an
application field or uninstalling its contributing plugin never infers a
destructive `DROP COLUMN`. Unsupported structures on a managed table stop
`override` before its transaction rather than being approximated.

Renames are explicit direct field options and preserve existing column data.
`renamedFrom` names the previous physical column, so it can also adopt a
camelCase column from a database created before column names became
`snake_case` (`renamedFrom: 'publishedAt'` on `publishedAt`, now stored as
`published_at`). It stays until a migrations plugin exists; remove it once the
rename has been applied to every database:

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
keys. The column takes the field's `snake_case` name, while the constraint name is deterministic and safe within PostgreSQL's identifier
limit. Optional pointers use nullable columns, while `required`, `indexed`, and
`indexed: "unique"` retain their normal Schema meaning. `onDelete` becomes
`RESTRICT`, `CASCADE`, or `SET NULL`, which enforce Core's referential-integrity
contract (ADR-0299) inside the deleting transaction: a referencing insert that
races a deletion waits on the foreign-key row lock and fails with
`REFERENCE_VIOLATION`, or commits first and receives the deletion's action.

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
const created = await Post.createOne({
	data: { author: { connect: author.id } },
})
const found = await Post.findOne({
	where: {
		author: {
			eq: author.id,
			is: { name: { startsWith: 'A' } },
		},
	},
	include: { author: { select: { id: true, name: true } } },
})
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
await Article.updateOne({
	where: { id: articleId },
	data: { tags: { connect: [firstTagId, secondTagId] } },
})

const { tags: selected } = await Article.findOneOrThrow({
	where: { id: articleId },
	select: { id: true },
	include: {
		tags: {
			select: { id: true, label: true },
			orderBy: { label: 'asc' },
			take: 20,
		},
	},
})

await Article.updateOne({
	where: { id: articleId },
	data: { tags: { set: [featuredTagId] } },
})
await Article.updateOne({
	where: { id: articleId },
	data: { tags: { set: [] } },
})
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
			skip: 10,
			take: 20,
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
per-parent query loop is used. A nested `skip` is applied by Drizzle
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
parameterized boundary. The examples use the builder plugin code constructs
from `@ultimabase/core/plugin` (ADR-0311); applications pass the same
canonical `where` objects to `findMany`:

```ts
import { QueryBuilder } from '@ultimabase/core/plugin'

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

const query = new QueryBuilder(ArticleSchema).where(
	(where) =>
		where
			.contains('metadata', { visibility: 'public' }) // @>
			.hasAnyKeys('metadata', ['visibility', 'featured']) // ?|
			.eq(fieldPath('profile', ['contact', 'email']), 'ada@example.com'), // #>
)
```

Containment documents, keys, key arrays, and path segment arrays are parameters.
The compiler uses `#>>` only for typed string matching and `#>` for JSONB value
comparisons. No public builder exposes PostgreSQL syntax or raw SQL.

The PostgreSQL-specific JSONPath and `containedBy` operators were removed by
ADR-0301; Core rejects them before the adapter.

Regex uses PostgreSQL advanced regular expressions for Core's portable subset
(ADR-0302), which Core validates before execution. `case-insensitive` selects
`~*`; the compiler maps the independent JavaScript-style `multiline` and
`dot-matches-newline` flags to PostgreSQL newline modes `n`, `s`, `w`, or `p`. String
ordering comparisons use the database column's configured collation. See the
[PostgreSQL pattern-matching reference](https://www.postgresql.org/docs/current/functions-matching.html)
for the underlying ARE syntax.

The compiler remains internal; developers build every scalar and relation
filter only through canonical `where` objects or `QueryBuilder.where`.

## Query selection and pagination compilation

The internal adapter also compiles projections, ordering, `take` as `LIMIT`, and
`skip` as `OFFSET`. Explicit selections load only their columns. PostgreSQL
preserves the ordering it receives and uses explicit null placement (`NULLS
LAST` in both directions); Core, not the adapter, completes a collection read
with its `id` tie-breaker:

```ts
const orderedPage = new QueryBuilder(ArticleSchema)
	.select({ id: true, title: true, createdAt: true })
	.descending('createdAt')
	.take(25)

const skippedPage = orderedPage.skip(50)
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

`.skip()` selects offset pagination. A `findMany({ after })` position reaches
PostgreSQL as an ordinary keyset predicate in the `where` filter (strictly
greater or lower ordered values, `IS NULL` for the null-last tail, `id` as the
last term) with no `OFFSET` (ADR-0309). An included relation's `after` compiles
the same predicate inside each parent's collection query. To compare positions, the adapter
declares `greater-than` and `less-than` for the `binary`, `boolean`, `enum`,
and `uuid` families as well; public filters still refuse ranges on those
kinds. Transport cursors are decoded by Core's shared encoder before PostgreSQL
receives the ordinary Query AST.

The builder remains a non-executing utility. Schema-root read commands normalize
their canonical objects to the same AST before this compiler runs.

## Table and column names

PostgreSQL owns physical naming. Without an override, class names use standard
English inflection and plural `snake_case`, and field names become
`snake_case` columns (ADR-0320):

```text
BlogPost  → blog_posts      createdAt → created_at
Person    → people          userID    → user_id
Category  → categories      URLValue  → url_value
```

Two fields of one schema that give the same column (`fooBar` and `foo_bar`)
fail compilation. Index and foreign-key names are derived from the physical
columns. Queries, results, errors, and logs keep the logical field names.

Use the `postgres` rule when the database needs an exact table identifier:

```ts
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const Application = UltimaBase.use(postgresPlugin())
const ArticleSchema = Application.Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string(),
	}),
}).with({ postgres: { table: 'ContentItems-v2' } })
```

The explicit name is preserved verbatim. It is passed to Drizzle as an
identifier and escaped there, never interpolated into raw SQL. The rule is
declared and compiled entirely by `@ultimabase/postgres-plugin`, so Core remains
independent from PostgreSQL. Configuring it without `postgresPlugin()` fails
static application compilation.

A database created with camelCase columns is not migrated automatically: under
`override` the new names are new columns, and the forgotten-rename check
refuses to start while the old required columns remain (`"posts"."createdAt"
... looks renamed to field createdAt`). Rename those columns outside
UltimaBase, or declare `renamedFrom` on developer fields.

## Kept boundaries

- No manual SQL goes through UltimaBase: a raw statement would bypass Access,
  ACL, Soft Delete, and hooks. The package exports no SQL or Drizzle API.
- For reports or analytics, query the database with your own pool outside
  UltimaBase (for example a `pg` pool on a read-only account); no UltimaBase
  rule applies there.
- To keep the tables in a dedicated PostgreSQL schema, set `search_path` in the
  URL: `postgres://app@db/main?options=-c%20search_path%3Dmy_app`.
  Synchronization and introspection follow `current_schema()`.
- `url` or `pool`, the three policies, and no destructive drop stay as
  described above.
