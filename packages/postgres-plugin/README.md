# @ultimabase/postgres-plugin

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
} from '@ultimabase/postgres-plugin'
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

The Drizzle client remains inside `@ultimabase/postgres-plugin`; neither plugin exports
nor public declarations expose it. Pool clients borrowed for future
transactions use the same internal wrapper.

Singular CRUD, bulk operations, upserts, and explicit Runtime transactions
execute through this adapter. Every mutation uses Runtime's transaction-bound
prepared-operation protocol; no bulk item opens a side transaction.

For an object selection that omits `id`, PostgreSQL fetches the identifier into
an adapter-private side channel and returns only the developer's requested
fields. Core uses that protected identity for immutable model `update` and
`delete` commands without exposing it through hooks, properties, `get()`, or
`toJSON()`.

Every adapter request carries Core's policy-neutral `constraints` array and an
optional framework-owned `rowFilter`. The latter contains native Access
restrictions outside the developer Query, so business hooks cannot inspect or
remove it. PostgreSQL compiles both channels and the developer predicate into
one parameterized `AND` expression.

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
	name: 'example.tenant-postgres',
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

The official ACL bridge follows this pattern in the separate
`@ultimabase/acl-postgres-plugin` package. Keeping that compiler outside both
dependency plugins preserves ACL's adapter neutrality and PostgreSQL's policy
neutrality.

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

Atomic create-many uses one ordered multi-row insert. Non-atomic create-many and
upsert-many isolate each item with a PostgreSQL savepoint, stop at the first
persistence failure, and leave the successful prefix available to the outer
Runtime transaction. A hook or finalization failure can still roll that prefix
back before commit.

### Native hook transactions

Native schema, inline field, and plugin-contributed hooks use the same borrowed
PostgreSQL client as the primary mutation. A hook may therefore start another
typed query without receiving a pool, Drizzle client, or explicit transaction:

```ts
hooks: {
	beforeCreate: async ({ operation }) => {
		if (operation.kind === 'create-one') {
			await AuditSchema.query().create({
				action: `create:${operation.input.title}`,
			})
		}

		return operation
	},
}
```

If a later business or finalization hook fails, PostgreSQL rolls back the audit
row and primary row together. Field and schema `afterCommit` hooks plus named
events are released only after a successful outer commit. The Docker-backed
public-package E2E suite verifies this behavior alongside plugin ordering,
opaque scope constraints, read restrictions, output resolution, and set-based bulk
semantics.

## CRUD, bulk, and upsert execution

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
Bulk operations and unique-target upserts are executable. Create and upsert
results preserve developer input order, while update-many and delete-many remain
single set-based statements returning only their affected counts. Resumed
opaque cursor tokens are not yet executable.

```ts
const imported = await ArticleSchema.query().createMany(rows, {
	atomic: false,
	ultimabase,
})

if (imported.status === 'stopped') {
	console.log(imported.failedIndex, imported.results)
}

const article = await ArticleSchema.query()
	.equalTo('slug', 'runtime-postgres')
	.upsert(
		{
			create: { slug: 'runtime-postgres', title: 'Runtime + PostgreSQL' },
			update: { set: { title: 'Runtime + PostgreSQL' } },
		},
		{ ultimabase },
	)
```

## Primitive schema compilation

Plugin setup now compiles every application schema into one private Drizzle
table catalog. Primitive scalars use their corresponding PostgreSQL types;
objects, JSON values, and lists of any depth use JSONB. Static defaults become
column metadata, while developer functions and framework timestamps remain
Runtime-owned and are never executed by the compiler.

```ts
import { createApplication } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import {
	bigintField,
	dateTimeField,
	Schema,
	objectField,
	stringField,
} from '@ultimabase/core'

const EventSchema = Schema.define({
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

Plugin fields that declare Core's portable versioned JSON storage codec also
compile to JSONB without coupling this package to the plugin kind. A single
non-unique index on JSONB uses GIN; synchronization and introspection preserve
the method and repair method drift. Plugin fields without a portable codec
remain unsupported until a specialized adapter compiler handles them.

## Index compilation

Field and composite indexes use the storage-neutral Schema API:

```ts
const ArticleSchema = Schema.define({
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

An official migration plugin claims `postgresSchemaPreparationClaimName`
during setup. This suppresses direct synchronization so exactly one
database-specific implementation owns the preparation phase.

## Pointer storage

Portable Core pointers compile to PostgreSQL UUID columns and named foreign
keys. The logical field name remains the physical column name, while the
constraint name is deterministic and safe within PostgreSQL's identifier
limit. `required`, `nullable`, `indexed`, and `indexed: "unique"` retain their
normal Schema meaning. `onDelete` becomes `RESTRICT`, `CASCADE`, or `SET NULL`.

```ts
import { pointerField, Schema, stringField } from '@ultimabase/core'

const User = Schema.define({
	className: 'User',
	fields: { name: stringField() },
})

const Post = Schema.define({
	className: 'Post',
	fields: {
		author: pointerField({
			target: () => User,
			validation: { required: true },
			indexed: true,
			onDelete: 'cascade',
		}),
	},
})

const author = User.pointer('0198f090-2a50-7000-8000-000000000034')
const created = await Post.query().create({ author }, { ultimabase })
const found = await Post.query()
	.equalTo('author', author)
	.include('author', (query) => query.select('id', 'name'))
	.first({ ultimabase })
```

Writes and predicates send only the target UUID as a parameter. Reads restore
an immutable `Pointer` bound to the exact registered target schema. Inclusion
then executes through Core's nested operation pipeline, so target Access,
hooks, request authority, and the current transaction remain enforced. Direct
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

const selected = await tags
	.query()
	.select('id', 'label')
	.ascending('label')
	.limit(20)
	.after()
	.find({ ultimabase })

await tags.set([Tag.pointer(featuredTagId)], { ultimabase })
await tags.disconnect(Tag.pointer(featuredTagId), { ultimabase })
await tags.clear({ ultimabase })
```

Relation scopes stay outside the developer Query AST and are combined with
developer predicates and native Access using parameterized SQL. Traversal
first checks the source relation field, then runs the target Query through its
ordinary Access and hook lifecycle. Mutations lock and update the source inside
the same Runtime transaction as their edge changes, so a later hook failure
rolls back both. Duplicate connects are idempotent. `.after()` enables the
stable first cursor page; resumed opaque cursor tokens retain the same general
execution limitation documented above.

Source relation quantifiers compile to correlated `EXISTS` expressions without
loading target rows:

```ts
const query = Article.query().some('tags', (tag) =>
	tag.equalTo('label', 'typescript'),
)
```

Owning joins, inverse joins, and inverse pointers share the same compiler.
`none` negates a matching `EXISTS`; `every` rejects a visible related row that
does not satisfy the target predicate, which makes it true for an empty
relation. Nested predicates receive deterministic table aliases. Developer
values, target Access filters, and plugin constraints remain parameters or
private compiler input and never become interpolated SQL text.

Relationships with business data remain ordinary schemas. For example, two
required pointers plus a composite unique index model a membership edge:

```ts
const Membership = Schema.define({
	className: 'Membership',
	fields: {
		member: pointerField({
			onDelete: 'cascade',
			target: () => Member,
			validation: { required: true },
		}),
		project: pointerField({
			onDelete: 'cascade',
			target: () => Project,
			validation: { required: true },
		}),
		role: stringField({ validation: { required: true } }),
	},
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

The compiler remains internal; developers build every scalar and relation
filter only through `Query`.

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
import { postgresTable } from '@ultimabase/postgres-plugin'
import { Schema, stringField } from '@ultimabase/core'

const ArticleSchema = Schema.define({
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
