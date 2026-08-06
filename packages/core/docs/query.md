# Core Query domain

Transport-neutral Query and Operation AST contracts, normalization, cursor
contracts, operators, and immutable read definitions.

`Query<TSchema>` is a context-free immutable read builder. It retains only the
transport-neutral AST and never retains a database, adapter, transaction,
request, authority, or transport. Writes belong to generated schema classes and
immutable schema models, so a read filter can never be silently ignored by a
create operation.

## Immutable read queries

```ts
const feed = Post.query()
	.where({
		OR: [{ published: { eq: true } }, { views: { gt: 1_000 } }],
	})
	.select({ id: true, title: true, createdAt: true })
	.descending('createdAt')
	.limit(25)

const nextPage = feed.after(cursor)
const firstCursorPage = feed.after()
const adminPage = feed.skip(50)
```

Every call returns a new `Query`, so every branch remains independent.
`limit` defines the page size; `skip` and `after` choose mutually exclusive
pagination positions.

`select` receives one flat boolean object correlated with the schema. As soon
as one field is `true`, only fields marked `true` remain visible. With only
`false` values, every schema field remains visible except those marked `false`:

```ts
const card = Post.query().select({ id: true, title: true })
const publicPost = Post.query().select({ internalNote: false })
```

An empty object keeps the complete result shape. Mixed objects use inclusion
mode, so `{ id: true, internalNote: false }` selects only `id`. Each `select`
call replaces the previous projection, and nested pointer shaping remains the
responsibility of `include`. Selection flags must be literal booleans so the
result type cannot disagree with a dynamic runtime projection.

`where` receives one schema-correlated object. Field and operator keys combine
through implicit `AND`, while `AND`, `OR`, and `NOT` compose recursive groups:

```ts
const visible = Post.query().where({
	published: { eq: true },
	views: { gte: 10, lt: 1_000 },
	NOT: { title: { startsWith: 'Archive' } },
})
```

Autocomplete exposes only operators supported by the selected field kind.
`AND`, `OR`, and `NOT` are reserved schema field names. Object identity uses the
same canonical filter contract:

```ts
const post = await Post.query()
	.where({ id: { eq: postId } })
	.findOne({ ultimabase })
```

The complete read terminal surface is `findOne`, `findMany`, `get`, `count`,
and `exists`. `findOne` and `get` return `null` when no visible object matches.
The `exists()` terminal tests whether a matching row exists; `isNull` and
`isNotNull` are field operators inside `where`.

## Reusable read scopes

A scope transforms a Query without capturing Runtime state or changing its
selection:

```ts
import { type QueryScope } from '@ultimabase/core'

const published: QueryScope<typeof Post> = (query) =>
	query.where({ published: { eq: true } })

const recentPublished: QueryScope<typeof Post> = (query) =>
	query.use(published).descending('createdAt').limit(25)

const feed = Post.query().select({ id: true, title: true }).use(recentPublished)
```

Repeated `where` calls combine through implicit `AND`. Object filters never
alter selection, ordering, limit, or pagination.

Ordered scalar fields expose first-class inclusive range predicates:

```ts
const midRange = Post.query().where({
	views: { between: { lower: 10, upper: 100 } },
})
const outsideMidRange = Post.query().where({
	views: { notBetween: { lower: 10, upper: 100 } },
})
```

`between` matches both bounds and every value between them. `notBetween`
matches values strictly below the lower bound or strictly above the upper
bound. Both methods retain one explicit range node in the Query AST, require
non-null bounds of the field's exact type, and are also available in schema
command `where`, Access filters, and relation predicates.

## Schema write commands

Generated schema classes own collection and target-based writes:

```ts
const created = await Post.createOne(
	{
		data: { title: 'Created from a job' },
		select: { id: true, title: true },
	},
	{ ultimabase },
)

const updated = await Post.updateOne(
	{
		where: { id: { eq: created.id } },
		data: { title: 'Updated' },
		select: { id: true, title: true },
	},
	{ ultimabase },
)

const deleted = await Post.deleteOne(
	{
		where: { id: { eq: created.id } },
		select: { id: true, title: true },
	},
	{ ultimabase },
)
```

The write surface is:

- `createOne({ data, select? }, options?)`
- `createMany({ data, select? }, options?)`
- `updateOne({ where, data, select? }, options?)`
- `updateMany({ where, data, select? }, options?)`
- `upsertOne({ where, create, update, select? }, options?)`
- `upsertMany({ data, select? }, options?)`
- `deleteOne({ where, select? }, options?)`
- `deleteMany({ where, select? }, options?)`

The object form is the source of truth for reads, mutations, and future
transports. Dynamic application code may use the public immutable utility
class, whose short methods build the exact same object contract:

```ts
import { WhereBuilder } from '@ultimabase/core'

const updated = await Post.updateMany({
	where: { published: { eq: false } },
	data: { published: true },
	select: { id: true, published: true },
})

const reusable = new WhereBuilder(Post).eq('published', false).gte('views', 10)

Post.query().where(reusable)
Post.query().where(reusable.build())
```

Update `data` is one field-oriented map. A direct value replaces the field,
an omitted property remains unchanged, and `null` clears an optional field.
Arithmetic operations stay explicit values, while `unset()` is a readable
alias for the same canonical `null` clear:

```ts
import { decrement, increment, unset } from '@ultimabase/core'

await Post.updateOne({
	where: { id: { eq: postId } },
	data: {
		title: 'Updated',
		views: increment(2),
		stock: decrement(1),
		summary: unset(),
	},
})
```

`increment()` and `decrement()` are accepted only by mutable scalar numeric
fields and preserve the field's exact type: numbers for integer and float
fields, strings for decimals, and bigint values for bigint fields. `unset()` is
accepted only where `null` is accepted, so required fields cannot be cleared.

An empty object or builder is rejected. A set-based command can deliberately
target all rows only with the explicit value `where: 'all'`:

```ts
await Post.deleteMany({ where: 'all' }, { useMasterKey: true })
```

`updateOne`, `deleteOne`, and `upsertOne` require an exact unique target: `id`, one
unique field, or all fields of one declared unique composite index. This keeps
singular cardinality independent from ordering, pagination, or adapter-specific
behavior.

## Mutation results and relationships

`createOne`, `updateOne`, and `deleteOne` return complete immutable models by
default and accept the same flat boolean `select` contract as Query reads. The
projection changes only the public result; mutation hooks continue to receive
complete logical materializations. Other singular schema commands still return
complete models. No mutation accepts `include`, and pointer or relation values
remain unloaded references:

```ts
const created = await Post.createOne({
	data: { title: 'Created' },
	select: { id: true, title: true },
})

const post = await Post.updateOne({
	where: { id: { eq: postId } },
	data: { title: 'Updated' },
	select: { id: true, title: true, author: true },
})

const deleted = await Post.deleteOne({
	where: { id: { eq: postId } },
	select: { id: true, title: true },
})

if (post !== null) {
	const authors = await post.author.query().findMany()
	const tags = await post.relation('tags').query().findMany()
}
```

Use a separate `Post.query()` when an included pointer is required. This keeps
relation I/O visible while allowing the write result itself to remain narrow.

`updateMany` and `deleteMany` always return immutable model arrays from the
same set-based database statement. Without `select`, they request only `id`;
an explicit selection returns exactly those post-update or pre-delete fields.
The array length is the affected-row count. They never materialize rows merely
to execute per-object mutation hooks:

```ts
const updated = await Post.updateMany({
	where: { published: { eq: false } },
	data: { published: true },
})
// [{ id }, ...]

const deleted = await Post.deleteMany({
	where: { archived: { eq: true } },
	select: { id: true, title: true },
})
// [{ id, title }, ...]
```

Runtime-issued models also expose identity-safe instance commands:

```ts
const draft = new Post({ title: 'Draft' })
const created = await draft.create({ select: { id: true, title: true } })
const updated = await created.update({
	data: { title: 'Updated' },
	select: { id: true, title: true },
})
await updated?.delete({ select: { id: true } })
```

Draft `create` and `upsert` delegate to the schema commands. Persisted `update`
and `delete` retain protected object identity even when the model came from a
narrow read selection. Their successful result follows the command's own
`select`, or returns the complete model when `select` is omitted. A read
projection never leaks into a later write response. Models remain immutable and
never gain dirty tracking or a mutable `save()` method.

## Contextual execution and authority

Every read terminal and write command resolves execution only when called.
Inside an active request, hook, or transaction it inherits the exact engine,
authority, cancellation signal, recursion state, and transaction:

```ts
const article = await Article.query()
	.where({ published: { eq: true } })
	.select({ id: true, title: true })
	.findOne()

const created = await Article.createOne({
	data: { title: 'Inherited request' },
})
```

Outside an active scope, pass the exact started application:

```ts
const articles = await Article.query().findMany({ ultimabase })
const created = await Article.createOne(
	{ data: { title: 'Root job' } },
	{ ultimabase },
)
```

An explicit plugin-derived context and audited master authority use the same
final options position:

```ts
const scoped = await Article.query().findMany({
	context: contextCreatedByAPlugin,
	ultimabase,
})

const imported = await Article.createMany(
	{ data: rows },
	{
		context: contextCreatedByAPlugin,
		ultimabase,
		useMasterKey: true,
	},
)
```

Core never accepts authentication credentials here. `useMasterKey: true`
elevates through the application-owned `MasterAuthority`, and terminal options
never enter a Query or Operation AST.

## Bulk writes

Bulk create and upsert are atomic by default. `atomic: false` persists inputs in
order, stops on the first persistence failure, and returns the successful prefix
explicitly without disabling Runtime's mutation transaction:

```ts
const imported = await Account.createMany(
	{
		data: rows,
		select: { id: true, email: true },
	},
	{
		atomic: false,
		ultimabase,
	},
)

if (imported.status === 'stopped') {
	console.error(imported.failedIndex, imported.error)
}
```

Bulk upsert gives every item its own exact unique predicate:

```ts
const imported = await Account.upsertMany(
	{
		data: rows.map((row) => ({
			where: { email: { eq: row.email } },
			create: row,
			update: { displayName: row.displayName },
		})),
		select: { id: true, email: true },
	},
	{ ultimabase },
)
```

The unique equality values seed the create candidate before hooks run. A
contradictory create value fails validation instead of targeting one object and
inserting another.

## Query and Operation ASTs

`createQueryAst()` creates the initial immutable read state. Its root separates
schema, selection, filtering, ordering, limit, and pagination without HTTP,
GraphQL, or SQL data:

```ts
import { createQueryAst } from '@ultimabase/core'

const ast = createQueryAst(Post)

ast.selection.fields // readonly []
ast.where // undefined
ast.limit // undefined
```

Read terminals and schema commands normalize into the same discriminated
`OperationAst` union. Reads use `find-one`, `find-many`, `get`, `count`, and
`exists`.
Writes distinguish `create-one`/`create-many`, `update-one`/`update-many`,
`upsert-one`/`upsert-many`, and `delete-one`/`delete-many`. Runtime, hooks,
Access, and adapters therefore keep exhaustive operation matching while the
public API clearly separates read construction from write intent.
