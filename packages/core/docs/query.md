# Core Query domain

Transport-neutral Query and Operation AST contracts, normalization, operators,
and immutable read definitions.

Generated schema classes expose object-input read commands. These objects are
the canonical, serializable contract shared with future transports. The
optional `QueryBuilder<TSchema>` remains a context-free immutable utility: it
retains only transport-neutral AST state and `build()` returns the same object
input without executing it. Neither form retains a database, adapter,
transaction, request, authority, or transport.

Transport packages use `normalizeReadOperation(schema, kind, input)` to reach
the same immutable native read AST without receiving an executor. The function
accepts untrusted object input, delegates every clause and field operand to the
canonical Query normalizers, and performs no Runtime, hook, Access, adapter, or
target-loading work.

When a transport reuses Core's filter object shape but represents field values
differently on the wire, it can first call
`transformQueryFilterInput(schema, where, transformOperand)`. Core owns the
immutable recursion through `AND`/`OR`/`NOT`, relationship predicates,
`count.where`, and structured `at` paths. The callback owns only one operand's
wire conversion and receives its terminal field, operator, and whether it came
from a structured path. The result remains untrusted input and must still pass
through `normalizeReadOperation()`.

After normalization, an attributed transport may pass that read AST and its
application-bound `RequestContext` to `ApplicationRequestExecutor.executeRead`.
Core then uses the ordinary Runtime pipeline; the transport still receives no
application, engine, adapter, authority, transaction, or lifecycle control.

## Canonical object reads

```ts
const feed = await Post.findMany({
	where: {
		OR: [{ published: { eq: true } }, { views: { gt: 1_000 } }],
	},
	select: { id: true, title: true, createdAt: true },
	orderBy: { createdAt: 'desc' },
	take: 25,
})
const next = await Post.findMany({
	where: {
		OR: [{ published: { eq: true } }, { views: { gt: 1_000 } }],
	},
	select: { id: true, title: true, createdAt: true },
	orderBy: { createdAt: 'desc' },
	take: 25,
	after: feed.at(-1),
})
```

`take` defines the maximum page size. `after` is the last row received from a
read of the same shape (ADR-0309): Core completes the order with `id`
ascending, validates the ordered values and `id` of that row, and turns them
into an ordinary caller filter combined with `where` by `AND`, so the next page
starts strictly after it. A row lacking an ordered field or `id` fails with
`VALIDATION_ERROR` and `publicDetails: { parameter: 'after' }`. `skip` skips a
validated non-negative number of matching rows instead and cannot be combined
with `after`. Transports encode positions as opaque strings with the shared
encoder of `@ultimabase/core/plugin` (`encodeQueryCursor`,
`decodeQueryCursor`).

`orderBy` is one schema-correlated object over non-list scalar and enum
fields. Every direction is optional and may be `asc`, `desc`, or `null`; `null`
is ignored like an absent property. When several fields are present, their
property order defines ordering priority; a collection read always ends with
`id` ascending unless `id` is already ordered:

```ts
const stableFeed = await Post.findMany({
	orderBy: { createdAt: 'desc', id: 'asc' },
})
```

Relation inclusions accept the same `take`, `skip` and `after` clauses, with
the same keyset rules as a root `findMany`. The adapter applies them
independently to every parent collection, without `OFFSET` for `after`.

`select` receives one flat boolean object correlated with the schema. As soon
as one field is `true`, only fields marked `true` and the implicit `id` remain
visible. With only `false` values, every schema field remains visible except
those marked `false`:

```ts
const cards = await Post.findMany({ select: { id: true, title: true } })
const publicPosts = await Post.findMany({ select: { internalNote: false } })
```

An empty object keeps the complete result shape. Mixed objects use inclusion
mode, so `{ id: true, internalNote: false }` selects only `id`. Each `select`
call replaces the previous projection, and nested pointer shaping remains the
responsibility of `include`. Selection flags must be literal booleans so the
result type cannot disagree with a dynamic runtime projection.

Pointer inclusions accept only `select` and nested `include`. A pointer already
identifies at most one target, so a nested `where` would ambiguously turn an
existing but non-matching target into `null`. To-many relation inclusions retain
`where`, ordering, `skip`, `take`, selection, and nested inclusion.

`where` receives one schema-correlated object. Field and operator keys combine
through implicit `AND`, while `AND`, `OR`, and `NOT` compose recursive groups:

```ts
const visible = await Post.findMany({
	where: {
		published: { eq: true },
		views: { gte: 10, lt: 1_000 },
		NOT: { title: { startsWith: 'Archive' } },
	},
})
```

Autocomplete exposes only operators supported by the selected field kind.
`AND`, `OR`, and `NOT` are reserved schema field names. On a non-list scalar,
enum or pointer field, a plain value means `eq` and `null` means `isNull: true`
(ADR-0307); list, `json`, `object` and relation fields keep explicit operators.
`findOneOrThrow` reads like `findOne` but fails with `NOT_FOUND` instead of
returning `null`:

```ts
const drafts = await Post.findMany({ where: { published: false } })
const post = await Post.findOneOrThrow({ where: { id: postId } })
```

Pointer identity filters accept target object IDs directly. Target traversal
stays explicit and target-typed through `is` or `isNot`:

```ts
const memberships = await Membership.findMany({
	where: {
		project: {
			eq: projectId,
			is: { archived: { eq: false } },
		},
	},
})
```

`eq` inspects only the stored pointer identity. `is` and `isNot` query the
visible target and therefore apply installed target policy. A null pointer satisfies
`isNot`; combine it with `isNotNull: true` when null pointers must be excluded.
Pointer nullability uses `isNull` and `isNotNull`, never `eq: null`.

The complete read surface is `findOne`, `findMany`, `get`, `count`, and
`exists`. `findOne` returns `null` when no visible object matches, while the
identity-targeted `get` throws `NOT_FOUND` when its object is absent. `exists`
tests whether a matching row exists; `isNull` and
`isNotNull` are field operators inside `where`.

To-many relations also expose their visible cardinality as a non-null integer
pseudo-field:

```ts
const establishedAuthors = await Author.findMany({
	where: {
		posts: {
			count: {
				where: { published: { eq: true } },
				gte: 3,
				lt: 100,
			},
		},
	},
})
```

`count` supports `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`,
`between`, and `notBetween`. Operands are non-negative safe integers. The count
includes only targets visible through installed target policy and plugin
constraints; installed source-relation field policy still applies. Its optional target-typed
`where` filters that visible collection before all comparisons are evaluated.
At least one comparison is required, and several comparisons share one
cardinality calculation.

For existence checks, prefer the explicit relation flags:

```ts
const untagged = await Post.findMany({
	where: { tags: { isEmpty: true } },
})
const tagged = await Post.findMany({
	where: { tags: { isNotEmpty: true } },
})
```

They normalize to `none: {}` and `some: {}` respectively, so adapters retain
their optimized existence predicates. Only literal `true` is accepted.

## Reusable read scopes

A scope transforms a `QueryBuilder` without capturing Runtime state or
changing its selection:

```ts
import { QueryBuilder, type QueryScope } from '@ultimabase/core'

const published: QueryScope<typeof Post> = (query) =>
	query.where({ published: { eq: true } })

const recentPublished: QueryScope<typeof Post> = (query) =>
	query.use(published).descending('createdAt').take(25)

const feedInput = new QueryBuilder(Post)
	.select({ id: true, title: true })
	.use(recentPublished)
	.build()
const feed = await Post.findMany(feedInput)
```

Repeated `where` calls combine through implicit `AND`. Object filters never
alter selection, ordering, `take`, or `skip`.

Ordered scalar fields expose first-class inclusive range predicates:

```ts
const midRange = await Post.findMany({
	where: { views: { between: { lower: 10, upper: 100 } } },
})
const outsideMidRange = await Post.findMany({
	where: { views: { notBetween: { lower: 10, upper: 100 } } },
})
```

`between` matches both bounds and every value between them. `notBetween`
matches values strictly below the lower bound or strictly above the upper
bound. Both methods retain one explicit range node in the Query AST, require
non-null bounds of the field's exact type, and are also available in schema
command `where`, installed Access filters, and relation predicates.
Relation cardinality ranges use the same object bounds under `count`.

## Schema write commands

Generated schema classes own collection and target-based writes:

```ts
const created = await Post.createOne({
	data: { title: 'Created from a job' },
	select: { id: true, title: true },
})

const updated = await Post.updateOne({
	where: { id: created.id },
	data: { title: 'Updated' },
	select: { id: true, title: true },
})

const deleted = await Post.deleteOne({
	where: { id: created.id },
	select: { id: true, title: true },
})
```

The write surface is:

- `createOne({ data, select?, include? }, options?)`
- `createMany({ data, select?, include? }, options?)`
- `updateOne({ id | where, data, select?, include? }, options?)`
- `updateMany({ data: [{ where, data }], select?, include? }, options?)`
- `upsertOne({ where, create, update, select? }, options?)`
- `upsertMany({ data, select? }, options?)`
- `deleteOne({ id | where, select? }, options?)`
- `deleteMany({ where: [where], select? }, options?)`

The object form is the source of truth for reads, mutations, and future
transports. Dynamic application code may use the public immutable utility
class, whose short methods build the exact same object contract:

```ts
import { QueryBuilder, WhereBuilder } from '@ultimabase/core'

const updated = await Post.updateMany({
	data: postIds.map((id) => ({
		where: { id: { eq: id } },
		data: { published: true },
	})),
	select: { id: true, published: true },
})

const reusable = new WhereBuilder(Post).eq('published', false).gte('views', 10)

const reusableInput = new QueryBuilder(Post).where(reusable).build()
await Post.findMany(reusableInput)
await Post.findMany({ where: reusable.build() })
```

Update `data` is one field-oriented map. A direct value replaces the field,
an omitted property remains unchanged, and `null` clears an optional field.
A numeric field also accepts an atomic `{ increment: n }` or
`{ decrement: n }` object (ADR-0307):

```ts
await Post.updateOne({
	where: { id: postId },
	data: {
		title: 'Updated',
		views: { increment: 2 },
		stock: { decrement: 1 },
		summary: null,
	},
})
```

`{ increment }` and `{ decrement }` are accepted only by mutable scalar numeric
fields, take exactly one key, and preserve the field's exact type: numbers for
integer and float fields, strings for decimals, and bigint values for bigint
fields. A numeric field has no other object value, so the form is unambiguous.
`null` is accepted only by optional fields, so required fields cannot be
cleared.

An empty object or builder is rejected. Collection updates and deletes require
one unique predicate per item; this API intentionally has no implicit
"all rows" target.

`updateOne`, `deleteOne` and `upsertOne` take their target only through
`where` (ADR-0307); `where: { id }` is the equality shorthand of
`{ id: { eq: id } }`. They require an exact unique target: `id`, one unique field, or all fields of one declared unique composite
index. This keeps singular cardinality independent from ordering, pagination,
or adapter-specific behavior. A schema-root `updateOne` or `deleteOne` returns
`null` when no target matches and does not invoke optional item behavior.

## Mutation results and relationships

`createOne`, `updateOne`, and `deleteOne` return complete immutable models by
default and accept the same flat boolean `select` contract as schema reads. The
projection changes only the public result; installed mutation behavior continues
to receive complete logical materializations. `createOne`, `createMany`,
`updateOne`, and `updateMany` also accept `include` for transaction-bound
relationship result projection. Delete and upsert commands do not accept
`include`. Without it, pointer fields remain unloaded references and to-many
relations are accessed through model handles:

```ts
const created = await Post.createOne({
	data: { title: 'Created' },
	select: { id: true, title: true },
})

const post = await Post.updateOne({
	where: { id: postId },
	data: { title: 'Updated' },
	select: { id: true, title: true },
	include: { author: { select: { name: true } } },
})

const deleted = await Post.deleteOne({
	where: { id: postId },
	select: { id: true, title: true },
})

if (post !== null) {
	const authorName = post.author?.name
}
```

An included target is loaded after the write inside the same transaction,
without replaying the root mutation's policies or hooks. Without an `include`,
use an explicit subsequent read when hydrated relationships are needed.

`updateMany` and `deleteMany` return arrays of frozen plain results in declaration
order. Without `select`, they request only `id`; an explicit selection returns
exactly those post-update or pre-delete fields. Every predicate must identify
one existing target. A missing target raises `NOT_FOUND` and rolls back the
complete batch together with all earlier item behavior and writes:

```ts
const updated = await Post.updateMany({
	data: [
		{ where: { id: { eq: firstId } }, data: { published: true } },
		{ where: { id: { eq: secondId } }, data: { published: true } },
	],
})
// [{ id: firstId }, { id: secondId }]

const deleted = await Post.deleteMany({
	where: [{ id: { eq: firstId } }, { id: { eq: secondId } }],
	select: { id: true, title: true },
})
// Results retain the same target order.
```

Results are frozen plain objects without methods (ADR-0310): there are no
drafts or instance commands. Update or delete a row you read by passing its
`id` as the target. Each command's result follows its own `select`, or is the
complete row when `select` is omitted; a read projection never leaks into a
later write response, and nothing gains dirty tracking or a mutable `save()`.

## Contextual execution and authority

Every schema read and write command resolves execution only when called.
Inside an active request, hook, or transaction it inherits the exact engine,
authority, cancellation signal, recursion state, and transaction:

```ts
const article = await Article.findOne({
	where: { published: { eq: true } },
	select: { id: true, title: true },
})

const created = await Article.createOne({
	data: { title: 'Inherited request' },
})
```

Outside an active scope, pass the exact started application:

```ts
const articles = await Article.findMany(undefined)
const created = await Article.createOne({ data: { title: 'Root job' } })
```

An explicit plugin-derived context and audited master authority use the same
final options position:

```ts
const scoped = await Article.findMany(undefined, {
	context: contextCreatedByAPlugin,
})

const imported = await Article.createMany(
	{ data: rows },
	{
		context: contextCreatedByAPlugin,
		useMasterKey: true,
	},
)
```

Core never accepts authentication credentials here. `useMasterKey: true`
elevates through the application-owned `MasterAuthority`, and operation options
never enter a Query or Operation AST.

Every command uses the same `OperationOptions` execution boundary.

## Bulk writes

Every bulk command is an ordered batch of singular item operations inside one
automatic transaction. It resolves to an immutable array only when every item
and pre-commit hook succeeds:

```ts
const imported = await Account.createMany({
	data: rows,
	select: { id: true, email: true },
})
```

Update, upsert, and delete batches give every item its own exact unique
predicate. Their hook lifecycle receives the same singular operation shape as
`updateOne`, `upsertOne`, or `deleteOne`: the public `kind` is cardinality-free,
while an exposed `operation.kind` remains the exact `*-one` terminal.

```ts
const imported = await Account.upsertMany({
	data: rows.map((row) => ({
		where: { email: { eq: row.email } },
		create: row,
		update: { displayName: row.displayName },
	})),
	select: { id: true, email: true },
})
```

The unique equality values seed the create candidate before installed behavior runs. A
contradictory create value fails validation instead of targeting one object and
inserting another.

## Query and Operation ASTs

`createQueryAst()` creates the initial immutable read state. Its root separates
schema, selection, filtering, ordering, `take`, and `skip` pagination without transport
or SQL data:

```ts
import { createQueryAst } from '@ultimabase/core'

const ast = createQueryAst(Post)

ast.selection.fields // readonly []
ast.where // undefined
ast.take // undefined
```

Read terminals and schema commands normalize into the same discriminated
`OperationAst` union. Reads use `find-one`, `find-many`, `get`, `count`, and
`exists`.
Schema mutations retain normalized query data directly instead of constructing
temporary read builders; protected row scopes stay outside the AST.
Writes distinguish `create-one`/`create-many`, `update-one`/`update-many`,
`upsert-one`/`upsert-many`, and `delete-one`/`delete-many`. Runtime and adapters
therefore retain exhaustive internal operation matching. After collection
itemization, the optional Access and Hooks plugins use cardinality-free
`create`, `update`, `upsert`, and `delete` business kinds. The normalized AST
retains the exact terminal discriminant internally, while early installed
operation policy exposes only its named capability and request context.
