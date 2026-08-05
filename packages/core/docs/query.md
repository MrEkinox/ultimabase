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
import { Query } from '@ultimabase/core'

const published = new Query(Post).equalTo('published', true)
const popular = new Query(Post).greaterThan('views', 1_000)

const feed = published
	.or(popular)
	.select('id', 'title', 'createdAt')
	.descending('createdAt')
	.limit(25)

const nextPage = feed.after(cursor)
const firstCursorPage = feed.after()
const adminPage = feed.skip(50)
```

Every call returns a new `Query`, so all four branches remain independent.
`limit` defines the page size; `skip` and `after` choose mutually exclusive
pagination positions.

`byId(id)` is the concise typed equivalent of `equalTo('id', id)`:

```ts
const post = await Post.query().byId(postId).first({ ultimabase })
```

The complete read terminal surface is `find`, `first`, `get`, `count`, and
`exists`. `first` and `get` return `null` when no visible object matches.
The `exists()` terminal tests whether a matching row exists; `isNull(fieldName)`
and `isNotNull(fieldName)` test a field value.

## Reusable read scopes

A scope transforms a Query without capturing Runtime state or changing its
selection:

```ts
import { type QueryScope } from '@ultimabase/core'

const published: QueryScope<typeof Post> = (query) =>
	query.equalTo('published', true)

const recentPublished: QueryScope<typeof Post> = (query) =>
	query.use(published).descending('createdAt').limit(25)

const feed = Post.query().select('id', 'title').use(recentPublished)
```

Direct filters form an implicit `and`. `and`, `or`, and `not` combine only the
filter expression from another Query of the exact same schema; selection,
ordering, limit, and pagination remain on the receiving branch.

## Schema write commands

Generated schema classes own collection and target-based writes:

```ts
const created = await Post.create(
	{ title: 'Created from a job' },
	{ ultimabase },
)

const updated = await Post.updateOne(
	{
		where: (where) => where.byId(created.id),
		data: { set: { title: 'Updated' } },
	},
	{ ultimabase },
)

const deleted = await Post.deleteOne(
	{ where: (where) => where.byId(created.id) },
	{ ultimabase },
)
```

The write surface is:

- `create(input, options?)`
- `createMany(inputs, options?)`
- `updateOne({ where, data }, options?)`
- `updateMany({ where, data }, options?)`
- `upsert({ where, create, update }, options?)`
- `upsertMany(items, options?)`
- `deleteOne({ where }, options?)`
- `deleteMany({ where }, options?)`

`where` receives an immutable filter-only builder. It exposes the same typed
scalar, logical, and relation predicates as Query, but no selection, ordering,
pagination, read terminal, execution option, or authority method:

```ts
await Post.updateMany({
	where: (where) => where.equalTo('published', false),
	data: { set: { published: true } },
})
```

An empty callback is rejected. A set-based command can deliberately target all
rows only with the explicit value `where: 'all'`:

```ts
await Post.deleteMany({ where: 'all' }, { useMasterKey: true })
```

`updateOne`, `deleteOne`, and `upsert` require an exact unique target: `id`, one
unique field, or all fields of one declared unique composite index. This keeps
singular cardinality independent from ordering, pagination, or adapter-specific
behavior.

## Mutation results and relationships

Singular schema commands return a complete immutable model. They do not accept
`select` or `include`. Pointer and relation values remain unloaded references;
the mutation never triggers an implicit relation read:

```ts
const post = await Post.updateOne({
	where: (where) => where.byId(postId),
	data: { set: { title: 'Updated' } },
})

if (post !== null) {
	const authors = await post.author.query().find()
	const tags = await post.relation('tags').query().find()
}
```

Use a separate `Post.query()` when an exact projection or included pointer is
required. This makes the I/O visible and keeps every write result predictable.

Runtime-issued models also expose identity-safe instance commands:

```ts
const draft = new Post({ title: 'Draft' })
const created = await draft.create()
const updated = await created.update({ set: { title: 'Updated' } })
await updated?.delete()
```

Draft `create` and `upsert` delegate to the schema commands. Persisted `update`
and `delete` retain protected object identity even when the model came from a
narrow read selection. Their successful result is nevertheless a complete
model: a read projection never leaks into a later write response. Models remain
immutable and never gain dirty tracking or a mutable `save()` method.

## Contextual execution and authority

Every read terminal and write command resolves execution only when called.
Inside an active request, hook, or transaction it inherits the exact engine,
authority, cancellation signal, recursion state, and transaction:

```ts
const article = await Article.query()
	.equalTo('published', true)
	.select('id', 'title')
	.first()

const created = await Article.create({ title: 'Inherited request' })
```

Outside an active scope, pass the exact started application:

```ts
const articles = await Article.query().find({ ultimabase })
const created = await Article.create({ title: 'Root job' }, { ultimabase })
```

An explicit plugin-derived context and audited master authority use the same
final options position:

```ts
const scoped = await Article.query().find({
	context: contextCreatedByAPlugin,
	ultimabase,
})

const imported = await Article.createMany(rows, {
	context: contextCreatedByAPlugin,
	ultimabase,
	useMasterKey: true,
})
```

Core never accepts authentication credentials here. `useMasterKey: true`
elevates through the application-owned `MasterAuthority`, and terminal options
never enter a Query or Operation AST.

## Bulk writes

Bulk create and upsert are atomic by default. `atomic: false` persists inputs in
order, stops on the first persistence failure, and returns the successful prefix
explicitly without disabling Runtime's mutation transaction:

```ts
const imported = await Account.createMany(rows, {
	atomic: false,
	ultimabase,
})

if (imported.status === 'stopped') {
	console.error(imported.failedIndex, imported.error)
}
```

Bulk upsert gives every item its own exact unique predicate:

```ts
const imported = await Account.upsertMany(
	rows.map((row) => ({
		where: (where) => where.equalTo('email', row.email),
		create: row,
		update: { set: { displayName: row.displayName } },
	})),
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
`OperationAst` union. Reads use `find`, `first`, `get`, `count`, and `exists`.
Writes distinguish `create-one`/`create-many`, `update-one`/`update-many`,
`upsert-one`/`upsert-many`, and `delete-one`/`delete-many`. Runtime, hooks,
Access, and adapters therefore keep exhaustive operation matching while the
public API clearly separates read construction from write intent.
