# Core Query domain

Transport-neutral Query and Operation AST contracts, normalization, cursor contracts, operators, and immutable query definitions.

The public `Query<TSchema>` class is context-free, reusable, and directly
executable. Its builder retains only the transport-neutral AST. A terminal
resolves the active Runtime request at call time, accepts an already-derived
plugin context, or accepts `{ ultimabase }` when no request scope exists. Query
never retains a database, adapter, transaction, request, authority, or
transport.

## Immutable Query builder

`Query` exposes the Parse-inspired developer API while preserving one typed,
transport-neutral AST:

```ts
import { Query } from '@ultimabase/core'

const published = new Query(postSchema).equalTo('published', true)
const popular = new Query(postSchema).greaterThan('views', 1_000)

const feed = published
	.or(popular)
	.select('id', 'title', 'createdAt')
	.descending('createdAt')
	.limit(25)

const nextPage = feed.after(cursor)
const firstCursorPage = feed.after()
const adminPage = feed.skip(50)
```

Every call creates a new `Query`, so `feed`, `nextPage`, and `adminPage` are safe
independent branches. Their unchanged immutable AST nodes are shared. `limit`
defines the page size; `skip` and `after` choose mutually exclusive positions.

The framework-owned identifier has a concise builder alias that remains
composable with every other filter and terminal:

```ts
const updated = await postSchema
	.query()
	.byId(created.id)
	.update({ set: { title: 'Updated' } }, { ultimabase })
```

`byId(id)` is the typed equivalent of `equalTo('id', id)`. It returns a new
branch, preserves existing filters and selections, and introduces no special
operation or adapter path.

## Reusable Query scopes

A typed scope names a reusable transformation without capturing a Runtime
engine. It preserves the current selection, so applying it never silently
changes the result shape:

```ts
import { type QueryScope } from '@ultimabase/core'

const published: QueryScope<typeof postSchema> = (query) =>
	query.equalTo('published', true)

const recentPublished: QueryScope<typeof postSchema> = (query) =>
	query.use(published).descending('createdAt').limit(25)

const feed = postSchema.query().select('id', 'title').use(recentPublished)
```

`Query.use()` returns another context-free branch. Exact schema identity is
checked both statically and at the JavaScript boundary. A factory may close over
request-specific filter values, but a scope never receives the application,
request authority, transaction, or transport state.

Direct filter calls form an implicit `and`. The `and`, `or`, and `not` methods
combine only the filter of another query built from the exact same schema
definition; selection, ordering, limit, and pagination stay on the receiving
query. The compiler correlates each field with its legal operators and exact
value type, while the runtime boundary repeats the validation for JavaScript
and transport callers.

## Contextual Runtime execution

Every terminal resolves execution only when called. Inside an active request,
transaction, or queryable hook, it reuses that exact request authority,
transaction, cancellation signal, recursion state, and revocable hook lease:

```ts
const article = await articleSchema
	.query()
	.equalTo('published', true)
	.select('id', 'title')
	.first()

const created = await articleSchema.query().create({ title: 'Typed terminals' })

const updatedCount = await articleSchema
	.query()
	.equalTo('published', true)
	.updateMany({ increment: { views: 1 } })
```

Schema model commands are concise immutable aliases over these same terminals:

```ts
const created = await new ArticleSchema({ title: 'Typed model' }).create()
const updated = await created.update({
	set: { title: 'Updated model' },
})
await updated?.delete()
```

Draft `upsert({ where, update }, options?)` builds the same unique equality
target as `Query.upsert({ create, update }, options?)`. Instance commands keep
the model's visible selection and protected identity; they never place either
execution authority or hidden fields in the Query AST.

Transaction-bound plugins that own a locked logical preimage may derive one
immutable proposed candidate with `applyUpdateExpressionToRecord(schema,
current, update)`. The helper applies the normalized portable scalar operators,
including exact decimal and bigint arithmetic, without importing an adapter or
executing persistence.

Outside a request scope, the final terminal argument identifies the exact
started application. Runtime creates one anonymous internal root request; it
never falls back to a process-wide default:

```ts
const articles = await ArticleSchema.query().find({ ultimabase })
const created = await ArticleSchema.query().create(
	{ title: 'From a job' },
	{ ultimabase },
)
```

Calling a terminal without ambient or explicit ownership throws
`MISSING_EXECUTION_CONTEXT`. Supplying a different application inside an active
scope is rejected instead of changing the operation's transaction. The same
immutable Query branch may safely execute in different sequential or concurrent
request scopes because no execution owner enters its AST.

The same final options position selects one plugin-derived context or audited
master authority. Core never validates an authentication credential here:

```ts
const scoped = await ArticleSchema.query().find({
	context: contextCreatedByAPlugin,
	ultimabase,
})

const allArticles = await ArticleSchema.query().find({ useMasterKey: true })

const auditedImport = await ArticleSchema.query().createMany(rows, {
	context: contextCreatedByAPlugin,
	ultimabase,
	useMasterKey: true,
})
```

Omitting `ultimabase` inherits the active application. Outside an active scope,
an explicit context requires its exact `ultimabase`. Contexts are claimed by
their first application binding and cannot cross isolated applications.
`useMasterKey: true` elevates the inherited or explicit context through that
application's `MasterAuthority`; audit failure or missing authority prevents the
operation. Inside hooks and transactions the derived engine keeps the same
transaction, cancellation boundary, recursion protection, and revocable lease.

`InferQueryResult` derives the terminal result shape from the accumulated
selection. The projected result is materialized before it reaches public
declarations, so editor hovers show only selected properties instead of an
expanded schema or `Pick` helper. Update terminal hovers similarly materialize
legal `set`, `unset`, `increment`, and `decrement` groups.

The concise singular terminals are `create`, `update`, `upsert`, and `delete`;
their explicit `*One` counterparts remain available. Collection and set-based
operations always keep the explicit `createMany`, `updateMany`, `upsertMany`,
and `deleteMany` names because their inputs, results, and database behavior
differ. No singular method accepts an array or changes cardinality through an
overload.

The complete terminal surface also includes `find`, `first`, `get`, `count`,
and `exists`. The
zero-argument `exists()` terminal coexists with the Parse-inspired
`exists(fieldName)` filter. `first`, `get`, `update`/`updateOne`, and
`delete`/`deleteOne` return `null` when no object matches. Bulk update and delete
return affected-object counts. Create and upsert results retain input order;
query-backed singular object results follow the accumulated selection exactly.

## Bulk writes and unique upserts

Bulk create and upsert request one all-or-nothing collection group by default.
Setting `atomic: false` asks the adapter to persist inputs in order, stop on the
first persistence failure, and return the successful prefix explicitly. It
never disables Runtime's mandatory mutation transaction:

```ts
const accounts = await accountSchema
	.query()
	.createMany(
		[{ email: 'first@example.com' }, { email: 'second@example.com' }],
		{ ultimabase },
	)

const imported = await accountSchema.query().createMany(importRows, {
	atomic: false,
	ultimabase,
})

if (imported.status === 'stopped') {
	console.error(`Input ${String(imported.failedIndex)} failed`, imported.error)
}
```

The `completed` branch contains one result per input. The `stopped` branch
contains only the successful prefix, and `failedIndex` equals
`results.length`. No later input is attempted. The wrapper is immutable, and
its `error` remains `unknown` until application code narrows it.

One operation-level before/after hook cycle wraps the collection. Field input
hooks run in stable input order, and field result hooks observe only adapter
materializations from the successful prefix. A hook or validation failure still
rejects and rolls back everything; post-commit work runs once only after the
outer transaction commits. Result hooks may transform successful records but
cannot rewrite the adapter-owned `status` or `failedIndex`. Transports and
adapters must not interpret `atomic: false` as permission to execute directly
on the root database adapter.

`upsertOne` uses the bound query as its conflict target. It must contain only
distinct, non-null equality filters that exactly match `id`, one unique field,
or one declared unique composite index. Ordering, limit, and pagination are
rejected because they do not contribute to identity:

```ts
const account = await accountSchema
	.query()
	.equalTo('email', 'dev@ultimabase.dev')
	.upsert(
		{
			create: { email: 'dev@ultimabase.dev' },
			update: { increment: { signInCount: 1 } },
		},
		{ ultimabase },
	)

const imported = await accountSchema.query().upsertMany(
	[
		{
			query: new Query(accountSchema).equalTo('email', row.email),
			create: row,
			update: { set: { displayName: row.displayName } },
		},
	],
	{ ultimabase },
)
```

Each bulk upsert item supplies its own reusable unbound `Query`. The normalized
operation records the matching unique fields in schema declaration order, so
every adapter receives the same conflict target without inferring it again.
The target equality values seed the create candidate before hooks run. Supplying
a contradictory value in `create` fails validation instead of targeting one
object and inserting another; an `id` target also replaces Runtime's generated
create identifier.

Terminal options are never serialized into Query or Operation ASTs. Transports
continue executing normalized operations through explicit request engines and
cannot manufacture `ultimabase`, `context`, or `useMasterKey` from client input.

## Query AST

`createQueryAst()` creates the immutable neutral state used by future query
builders and normalizers. The exact schema definition is retained so field
names stay typed through every later stage:

```ts
import { createQueryAst } from '@ultimabase/core'
import { Schema, stringField } from '@ultimabase/core'

const postSchema = Schema.define({
	className: 'Post',
	fields: {
		title: stringField(),
	},
})

const ast = createQueryAst(postSchema)

// The initial AST has no clauses and contains no HTTP, GraphQL, or SQL data.
ast.selection.fields // readonly []
ast.where // undefined
ast.limit // undefined
```

The root separates schema, selection, filtering, ordering, limit, and pagination
position. This lets REST, GraphQL, and direct TypeScript callers normalize into
the same representation while adapters compile it later.

Query builders, query normalization, and cursors remain separate capabilities
that extend the neutral nodes without adding execution concerns to the package.

## Terminal Operation AST

Every terminal method normalizes to one discriminated `OperationAst`.
The union distinguishes all thirteen behaviors explicitly:

```ts
type ArticleOperation = OperationAst<
	typeof articleSchema,
	ArticleUpdateExpression
>

const operation = {
	kind: 'upsert-one',
	query: articleQuery.ast,
	target: { kind: 'unique-upsert-target', fields: ['id'] },
	create: { title: 'UltimaBase' },
	update: updateExpression,
} satisfies ArticleOperation
```

Reads use `find`, `first`, `get`, `count`, and `exists`. Writes distinguish
`create-one` from `create-many`, `update-one` from `update-many`, `upsert-one`
from `upsert-many`, and `delete-one` from `delete-many`. This makes Runtime,
hooks, permissions, and adapters handle additions through exhaustive matching.

Create values retain `InferCreateInput<TSchema>`. Updates carry a separate
`UpdateExpression<TSchema>`; they never overload a create or replacement input.
Upserts similarly keep their target query, create values, and update expression
independent.

Only bulk create and bulk upsert carry `AtomicBulkOperationOptions`. Its sole
property is `atomic`, which describes collection grouping rather than whether a
transaction exists. Master authority is deliberately absent from every
operation. Trusted authority belongs to Runtime's separately constructed
request context, so transport input cannot manufacture it by adding an
operation option.

These contracts do not validate or snapshot untrusted write values. Runtime
structural validation remains the single boundary for REST, GraphQL, jobs, and
direct TypeScript terminals.

## Atomic update expressions

`normalizeUpdateExpression()` accepts a compact schema-typed input and produces
one deterministic list of atomic field operations:

```ts
const update = normalizeUpdateExpression(articleSchema, {
	set: {
		title: 'Typed updates',
	},
	unset: ['summary'],
	increment: {
		views: 1,
	},
	decrement: {
		credits: 5,
	},
})
```

`set` accepts every mutable field with its exact `InferUpdateInput` value.
`unset` accepts only mutable fields whose persisted output may be absent, so it
cannot remove required, defaulted, auto-generated, or auto-incremented values.
`increment` and `decrement` accept only scalar `int`, `float`, `bigint`, and
`decimal` fields. Their deltas retain the field's exact non-null scalar type.

The same field cannot appear in more than one group, including twice in
`unset`. Normalization rejects conflicts, unknown groups, unknown fields,
immutable fields, system fields, malformed groups, and empty expressions. It
emits operations in `set`, `unset`, `increment`, then `decrement` order while
preserving caller declaration order inside each group.

The normalized topology is immutable. Numeric deltas pass through their
field-owned scalar snapshot boundary. Set values intentionally remain pending
Runtime structural validation because object updates are partial rather than
complete create values.

## Primitive filters

Filter nodes keep fields and operands correlated with the exact schema:

```ts
import type { QueryPrimitiveFilterNode } from '@ultimabase/core'

const filter = {
	kind: 'greater-than',
	field: 'createdAt',
	value: '2026-07-31T12:00:00.000Z',
} as const satisfies QueryPrimitiveFilterNode<typeof postSchema>
```

The built-in capability matrix is deliberately explicit:

| Operators                                       | Supported scalar field kinds                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `equal`, `not-equal`, `in`, `not-in`            | bigint, binary, boolean, date, date-time, decimal, enum, float, integer, JSON, pointer, string, time, UUID |
| ordered comparisons                             | bigint, date, date-time, decimal, float, integer, string, time                                             |
| `contains`, `starts-with`, `ends-with`, `regex` | string                                                                                                     |
| `exists`                                        | every field                                                                                                |

Value operators apply only to non-list fields. Structured objects, lists, and
plugin field kinds expose `exists` until their owning capability defines
storage-independent operators. Nullable fields accept `null` for equality and
membership, but never for ordered comparisons.

Regex patterns remain inert data instead of executable `RegExp` instances:

```ts
const pattern = {
	source: '^ultima',
	flags: ['case-insensitive'],
} as const
```

Adapters map the semantic flags and always parameterize the source during
compilation.

## Logical filters

`and`, `or`, and `not` recursively compose primitive or plugin-owned leaf
filters. The normalizer produces one deterministic immutable structure:

```ts
import {
	normalizeLogicalFilter,
	type QueryPrimitiveFilterNode,
} from '@ultimabase/core'

const filter = normalizeLogicalFilter<
	QueryPrimitiveFilterNode<typeof postSchema>
>({
	kind: 'and',
	expressions: [
		{ kind: 'exists', field: 'title', exists: true },
		{
			kind: 'or',
			expressions: [
				{ kind: 'starts-with', field: 'title', value: 'Ultima' },
				{ kind: 'starts-with', field: 'title', value: 'Parse' },
			],
		},
	],
})
```

Normalization follows boolean identities:

| Input                          | Normalized result                |
| ------------------------------ | -------------------------------- |
| empty `and`                    | constant `true`                  |
| empty `or`                     | constant `false`                 |
| one-child group                | its child                        |
| nested groups of the same kind | one flat group in original order |
| `not(not(expression))`         | `expression`                     |

Neutral constants are removed and decisive constants collapse their group. A
mixed `and`/`or` structure is preserved because flattening it would change its
meaning. Caller-owned logical objects and arrays are never mutated. Leaf
factories remain responsible for snapshotting their own operator values.

## Selection, ordering, and offset pagination

Clause normalizers validate fields against the exact schema and return
immutable AST nodes:

```ts
import {
	normalizeQueryLimit,
	normalizeQueryOffsetPagination,
	normalizeQueryOrdering,
	normalizeQuerySelection,
} from '@ultimabase/core'

const selection = normalizeQuerySelection(postSchema, ['title', 'id', 'title'])
const ordering = normalizeQueryOrdering(postSchema, [
	{ field: 'createdAt', direction: 'descending' },
	{ field: 'title', direction: 'ascending' },
])
const limit = normalizeQueryLimit(25)
const pagination = normalizeQueryOffsetPagination({ skip: 50 })
```

Selection keeps the first occurrence of a field. Ordering keeps the first
position of a field while its last declaration controls direction. The single
query limit is a positive safe integer shared by every pagination strategy, and
skip is a non-negative safe integer. Empty clauses are removed or represented
by shared immutable nodes without mutating caller input.

The query package deliberately does not impose an application-wide maximum
limit. That policy belongs to the runtime or transport layer.

Pointer inclusion is a separate immutable clause. Only pointer keys are
accepted, and each included target keeps a normal independently shaped Query:

```ts
const query = PostSchema.query()
	.select('id', 'title')
	.include('author', (author) =>
		author.select('id', 'name').equalTo('active', true),
	)
```

When the parent already has an explicit selection, inclusion adds the pointer
field to it. With implicit select-all, the parent selection remains empty.
Repeating the same pointer keeps its first position while the latest callback
replaces its target shape. A non-included value remains `Pointer<TSchema>`;
an included value becomes the exact selected target model, preserving pointer
nullability and optionality.

`pointer.query()` creates an ordinary target Query already filtered by the
pointer ID. It performs no I/O until a terminal is called:

```ts
const authorName = await author.query().select('name').first({ ultimabase })
```

Inclusion nodes and pointer predicates contain only logical paths such as
`author`; foreign-key columns such as `authorId` are adapter concerns. This
portable inclusion AST executes through Runtime's source-field and target
Access lifecycle. An adapter without the required versioned capability fails
explicitly instead of returning an unexpanded Pointer under an included type.
To-many relations remain independently queried and paginated.

## Relation predicates

Source Queries filter to-many edges through the exact target schema without
loading the target collection:

```ts
const visiblePosts = UserSchema.query()
	.some('posts', (post) =>
		post
			.equalTo('published', true)
			.some('tags', (tag) => tag.equalTo('label', 'typescript')),
	)
	.none('posts', (post) => post.equalTo('status', 'blocked'))
```

`some` requires one matching visible target. `none` requires no matching target.
`every` requires every visible target to match and is true for an empty
relationship. The callback receives `RelationPredicate<TTarget>`, which offers
only typed filters and nested quantifiers—no selection, ordering, pagination,
terminal, or authority method.

Each predicate is an immutable portable Query AST node with bounded nesting.
Runtime associates it with a separate monotonic target Access scope, so a
source `beforeFind` hook cannot observe or remove target restrictions. Database
adapters must advertise relation-predicate support; PostgreSQL compiles the
tree into correlated parameterized `EXISTS` expressions.

## Opaque cursors

Cursor pagination uses stable keyset ordering rather than offset arithmetic.
`normalizeQueryCursorOrdering()` always places the framework `id` field last.
It inherits the last requested direction when `id` was omitted, or preserves
the explicit `id` direction when the developer supplied one:

```ts
import {
	createQueryCursorPayload,
	normalizeQueryCursorOrdering,
	normalizeQueryCursorPagination,
	normalizeQueryLimit,
	normalizeQueryOrdering,
	sealQueryCursor,
} from '@ultimabase/core'

const requestedOrdering = normalizeQueryOrdering(postSchema, [
	{ field: 'createdAt', direction: 'descending' },
])
const stableOrdering = normalizeQueryCursorOrdering(
	postSchema,
	requestedOrdering.orders,
)
const limit = normalizeQueryLimit(25)
const page = normalizeQueryCursorPagination({ after: previousCursor })

const payload = createQueryCursorPayload(postSchema, stableOrdering, lastPost)
const nextCursor = await sealQueryCursor(cursorCodec, payload)
```

The versioned payload records the schema class, exact ordering, and last values.
Clients only receive the opaque string returned by `sealQueryCursor()`. A
`QueryCursorCodec` must authenticate its output with a signature, MAC, or
authenticated encryption and reject modified tokens from `unseal()`; base64 or
plain JSON encoding alone does not satisfy the contract.

Opening a malformed or modified token throws `QueryCursorError` with
`CURSOR_INVALID`. A valid token created for another payload version, schema, or
ordering throws `CURSOR_INCOMPATIBLE`. Runtime can map these Query-owned errors
to its transport-safe framework error without reversing the package dependency
graph.

Call `.after()` without a token for the first cursor page, then pass the sealed
token to `.after(cursor)` for every following page. `limit` is deliberately not
part of the cursor or offset position. This keeps
one page-size clause for the future `.limit()` builder method, while `.skip()`
and `.after()` select mutually exclusive pagination positions.
