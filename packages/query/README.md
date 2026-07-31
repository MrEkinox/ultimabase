# @ultimabase/query

Transport-neutral Query and Operation AST contracts, normalization, cursor contracts, operators, and immutable query definitions.

The public `Query<TSchema>` class is unbound and reusable. `BoundQuery` retains
an execution owner across immutable branches; Runtime adds execution later.

This package does not own operation execution and must not import Core, Runtime,
a database, or a transport.

## Immutable Query builder

`Query` exposes the Parse-inspired developer API while preserving one typed,
transport-neutral AST:

```ts
import { Query } from '@ultimabase/query'

const published = new Query(postSchema).equalTo('published', true)
const popular = new Query(postSchema).greaterThan('views', 1_000)

const feed = published
	.or(popular)
	.select('id', 'title', 'createdAt')
	.descending('createdAt')
	.limit(25)

const nextPage = feed.after(cursor)
const adminPage = feed.skip(50)
```

Every call creates a new `Query`, so `feed`, `nextPage`, and `adminPage` are safe
independent branches. Their unchanged immutable AST nodes are shared. `limit`
defines the page size; `skip` and `after` choose mutually exclusive positions.

Direct filter calls form an implicit `and`. The `and`, `or`, and `not` methods
combine only the filter of another query built from the exact same schema
definition; selection, ordering, limit, and pagination stay on the receiving
query. The compiler correlates each field with its legal operators and exact
value type, while the runtime boundary repeats the validation for JavaScript
and transport callers.

An unbound `Query` exposes its immutable `ast` and explicit `bind` method, but
no executable terminal. Runtime supplies a neutral execution contract through
the separate bound facade, keeping this package independent from concrete
engines and adapters.

## Immutable Runtime binding

Binding retains an opaque execution owner without importing Runtime:

```ts
const reusable = new Query(articleSchema).equalTo('published', true)
const bound = reusable.bind(requestEngine).select('id', 'title').limit(25)

// The original remains reusable and has neither selection nor a limit.
reusable.ast.selection.fields // []
```

Every bound builder method returns a new `BoundQuery` with the same engine and
the same Query validation rules. `InferQueryResult` derives the terminal result
shape from the accumulated selection: no selection yields the full schema
object, while the example above yields `{ id: string; title?: string }` when
`title` is optional in the schema.

When the binding is a Runtime `RequestEngine`, singular terminals execute the
neutral Operation AST through the mandatory Runtime pipeline:

```ts
const article = await requestEngine
	.query(articleSchema)
	.equalTo('published', true)
	.select('id', 'title')
	.first()

const created = await requestEngine.query(articleSchema).create({
	title: 'Typed terminals',
})
```

The implemented terminals are `find`, `first`, `get`, `count`, `exists`,
`createOne`/`create`, `updateOne`, and `deleteOne`. The zero-argument
`exists()` terminal coexists with the Parse-inspired `exists(fieldName)` filter.
`first`, `get`, `updateOne`, and `deleteOne` return `null` when no object
matches. Create results contain the complete persisted shape; query-backed
object results follow the accumulated selection exactly.

Binding an arbitrary opaque object still supports immutable query composition,
but its terminals cannot be called unless the object satisfies the neutral
`QueryOperationExecutor` contract.

## Query AST

`createQueryAst()` creates the immutable neutral state used by future query
builders and normalizers. The exact schema definition is retained so field
names stay typed through every later stage:

```ts
import { createQueryAst } from '@ultimabase/query'
import { defineSchema, stringField } from '@ultimabase/schema'

const postSchema = defineSchema({
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
property is `atomic`; master authority is deliberately absent from every
operation. Trusted authority belongs to the future Runtime request context, so
transport input cannot manufacture it by adding an operation option.

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
import type { QueryPrimitiveFilterNode } from '@ultimabase/query'

const filter = {
	kind: 'greater-than',
	field: 'createdAt',
	value: '2026-07-31T12:00:00.000Z',
} as const satisfies QueryPrimitiveFilterNode<typeof postSchema>
```

The built-in capability matrix is deliberately explicit:

| Operators                                       | Supported scalar field kinds                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `equal`, `not-equal`, `in`, `not-in`            | bigint, binary, boolean, date, date-time, decimal, enum, float, integer, JSON, string, time, UUID |
| ordered comparisons                             | bigint, date, date-time, decimal, float, integer, string, time                                    |
| `contains`, `starts-with`, `ends-with`, `regex` | string                                                                                            |
| `exists`                                        | every field                                                                                       |

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
} from '@ultimabase/query'

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
} from '@ultimabase/query'

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
limit. That policy belongs to the runtime or transport layer. Relation
inclusion will be introduced with pointer and relation fields so only fields
that can actually be included are accepted.

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
} from '@ultimabase/query'

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

`limit` is deliberately not part of the cursor or offset position. This keeps
one page-size clause for the future `.limit()` builder method, while `.skip()`
and `.after()` select mutually exclusive pagination positions.
