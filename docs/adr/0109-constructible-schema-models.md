# ADR-0109: Constructible schema model classes

- Status: accepted
- Date: 2026-08-03
- Refines: ADR-0005, ADR-0019, ADR-0052, ADR-0067, ADR-0094, ADR-0108
- Supersedes: ADR-0093
- Refined by: ADR-0115, ADR-0192

## Context

The current `new Schema(options)` value gives schemas strong immutable identity,
but query results remain plain objects and a separate future `UltimaObject`
wrapper would hide their concrete schema behind another generic class. It also
leaves developers choosing between `new Query(PostSchema)` for reads and an
unrelated result object for object-level behavior.

UltimaBase should retain one static TypeScript source of truth while giving each
schema a concise class identity. Developers should be able to construct a typed
draft with `new Post(values)`, start collection queries with `Post.query()`, and
receive the same immutable class from Runtime results. This must not require
decorators, code generation, repeated generics, or a constructor that secretly
returns another constructor.

## Decision

### Schema.define creates the model class

`Schema` exposes `Schema.define(options)` as the only schema declaration entry
point. The method validates and snapshots the existing schema options, then
returns one immutable, constructible schema model class:

```ts
export const Post = Schema.define({
	className: 'Post',
	fields: {
		title: stringField({
			validation: { required: true },
		}),
	},
})
```

The returned class is the schema's exact public identity. Applications register
it, Query accepts it, plugins target it, and relations may reference it. Static
read-only metadata exposes at least `definition`, `className`, and `fields` for
framework and developer inspection. Foundational internals continue consuming
the transport-neutral structural definition instead of depending on model
instance behavior.

`new Schema(options)` is removed rather than retained as a second declaration
path. Making that constructor return a model constructor would be surprising at
runtime and harder for TypeScript, `instanceof`, declarations, and debugging.
The returned model class is final by public contract; composition, schema
extensions, and plugins remain the supported extension mechanisms.

### Static Query entry point

Every generated schema class inherits one static `query()` method. It returns a
fresh `new Query(Post)` branch and retains no application, request, authority,
transaction, or adapter:

```ts
const posts = await Post.query().equalTo('published', true).find()
```

`new Query(Post)` remains the lower-level equivalent for dynamic framework and
plugin code. Query owns all builder methods; schema classes do not mirror its
surface beyond the single `query()` entry point.

### Immutable draft and persisted instances

`new Post(createInput)` performs no I/O and creates an immutable draft with exact
field inference. Runtime materializes successful create, update, upsert, find,
and compatible delete results as immutable instances of that same schema class,
after hooks, output restrictions, and selection narrowing complete.

Direct properties, `get(field)`, and `toJSON()` expose only the statically and
dynamically visible result shape. Runtime may retain protected schema and object
identity needed for safe instance commands, but it never exposes an unselected
or restricted field through properties or serialization.

Draft and persisted states are distinct public generic states. A constructed
draft exposes `create` and `upsert`; a successfully persisted or queried model
exposes `update` and `delete`. Supplying an `id` to a draft does not forge a
persisted state.

### Persistence remains Query-owned

Model instance commands are immutable convenience terminals, not direct
database access or mutable Active Record. They delegate to the exact same Query
terminal, Runtime pipeline, validation, hooks, transaction, and installed
policies:

```ts
const created = await new Post({ title: 'Hello' }).create()

const updated = await created.update({
	set: { title: 'Updated' },
})

await updated.delete()
```

Each command accepts the shared terminal execution options in its final
position and returns a new result; no method mutates its receiver. There is no
dirty tracking, implicit write batching, adapter handle, or automatically
branching `save()` in this decision. Roles and other domain values do not gain
persistence methods merely because schema model instances have them.

## Consequences

- One symbol represents schema identity, the typed object constructor, query
  entry point, and Runtime result class.
- Regular application code uses `Post.query()` while `new Query(Post)` remains
  the composable low-level primitive.
- Static schema inference continues to drive create, update, result, selection,
  GraphQL, migration, and adapter contracts.
- Instance persistence avoids repeated identifier filters without bypassing the
  single operation pipeline or ambient execution context.
- Draft and persisted states make invalid object-level operations visible in
  autocomplete before execution.
- The implementation must provide compact named hovers and avoid expanding the
  complete field definition through every model method.
