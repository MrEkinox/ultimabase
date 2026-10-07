# ADR-0243: Singular nested writes use one bounded Core mutation graph

- Status: accepted
- Date: 2026-09-08
- Refines: ADR-0118, ADR-0134, ADR-0164, ADR-0166, ADR-0170, ADR-0172, ADR-0180, ADR-0225, ADR-0228, ADR-0232, ADR-0238
- Depends on: ADR-0099, ADR-0118, ADR-0164, ADR-0166, ADR-0170, ADR-0172, ADR-0180, ADR-0206, ADR-0218, ADR-0225, ADR-0232, ADR-0238

## Context

UltimaBase can already create and update one object, write pointer values,
mutate an immutable `Relation` handle, run nested operations inside one active
transaction, and project a mutation result with eager relationships. A caller
that creates an aggregate must nevertheless coordinate every target create,
source write, relation mutation, and rollback manually.

Adding command-shaped objects directly to stored pointer values would confuse
developer syntax with persisted data. Letting REST, GraphQL, or PostgreSQL own
the graph would instead create a second mutation engine and a policy bypass.
The contract also needs finite recursive execution, deterministic Hook order,
and one answer for relation conflicts before public types are generated.

## Decision

### Only singular schema commands gain nested data

`createOne` and `updateOne` accept nested commands inside their existing
`data` object. A persisted model's `update()` command uses the same update
input. No additional `relations` envelope, nested terminal, callback builder,
or adapter syntax exists.

```ts
const post = await Post.createOne({
	data: {
		author: { connect: authorId },
		comments: {
			create: [{ body: 'First' }, { body: 'Second' }],
			connect: [existingCommentId],
		},
		title: 'Hello',
	},
	include: { author: true, comments: true },
})

await Post.updateOne({
	id: post.id,
	data: {
		author: { update: { displayName: 'Ada' } },
		comments: {
			create: [{ body: 'Third' }],
			update: [{ id: firstCommentId, data: { body: 'Edited' } }],
			disconnect: [oldCommentId],
		},
	},
})
```

`createMany`, `updateMany`, every upsert command, and draft construction remain
flat in this version. `new Post({ author: User.pointer(id) })` and the draft's
`create()` command continue to model and persist ordinary logical values; they
do not accept relation commands. This distinction keeps a draft an immutable
candidate object rather than an executable graph.

### Pointer commands are exclusive

A pointer field accepts exactly one command. Its available commands are:

| Root command | Pointer command | Value              | Meaning                                                  |
| ------------ | --------------- | ------------------ | -------------------------------------------------------- |
| create       | `connect`       | target ID          | store one existing visible target                        |
| create       | `create`        | target create data | create the target, then store its identity               |
| update       | `connect`       | target ID          | fill or replace the source pointer                       |
| update       | `create`        | target create data | create a target, then fill or replace the source pointer |
| update       | `update`        | target update data | update the currently linked visible target               |
| update       | `disconnect`    | literal `true`     | clear an optional source pointer                         |

`disconnect` is absent for required pointers. `update` does not accept an ID:
the current source value identifies its one target. A missing, null, invisible,
or foreign current target fails with the same protected `NOT_FOUND` result.
Pointer `create` and `connect` become the source field's final `fill` or
`replace` transition, `disconnect` becomes `clear`, and nested `update` uses a
same-identity `replace` transition. The official field Access engine therefore
protects every pointer path without gaining a pointer-specific permission.

The command object must be a non-empty plain record with one known own string
key. Explicit `null`, `false`, multiple commands, symbol keys, and unknown keys
are invalid. A command object never reaches field value validation or storage.

### Relation commands compose only when their effects are incremental

A relation field accepts these commands:

| Root command     | Relation command | Value                              | Meaning                                                   |
| ---------------- | ---------------- | ---------------------------------- | --------------------------------------------------------- |
| create or update | `create`         | non-empty target create-data array | create targets and connect them                           |
| create or update | `connect`        | non-empty target-ID array          | add visible targets                                       |
| update           | `update`         | non-empty `{ id, data }` array     | update currently related visible targets                  |
| update           | `disconnect`     | non-empty target-ID array          | remove visible memberships without deleting targets       |
| update           | `set`            | target-ID array, including empty   | replace the visible membership with these visible targets |
| update           | `clear`          | literal `true`                     | remove every visible membership                           |

`create`, `connect`, `update`, and `disconnect` may coexist in one relation
command object. Core processes those keys in that fixed order, independently
of JavaScript or JSON property order, and preserves declaration order inside
each array. `set` and `clear` are replacement commands: each must be the only
key in its object. The object itself must be non-empty.

A duplicate ID inside one array, or the same ID named by two incremental
commands, is a validation error. This rejects connect/disconnect,
connect/update, update/disconnect, and every other ambiguous cross-command
combination before the first Runtime effect. `set` also rejects duplicate IDs.
Created targets have Core-reserved identities and cannot collide with an
input ID.

For an inverse relation mapped by a required pointer, `disconnect`, `set`, and
`clear` are not generated because they could require clearing that pointer.
`connect` may move a target by executing the ordinary required-pointer replace
on the target. An optional inverse pointer supports the complete matrix.
Owning relations and inverses mapped by an owning relation support the complete
matrix.

`disconnect`, `set`, and `clear` change membership only. No relation command
deletes a target. Replacement operates on the request-visible membership;
policy-hidden memberships are neither disclosed nor silently removed.

### Field-bound identities contain only IDs

`connect`, relation `disconnect`, relation `set`, and relation-update item IDs
accept the target object's canonical Core ID. It is `string` in TypeScript and
the current object-ID contract validates UUID v7 at public wire boundaries.
The source field supplies the exact target schema, so a class name, `Pointer`,
model instance, arbitrary unique predicate, or `{ id }` wrapper is redundant
and invalid.

The `Pointer` class remains the stored model value and the value observed by
field resolution, Hooks, Access transitions, Query filters, results, and
adapters. Nested syntax normalizes to that logical value before those
boundaries run.

### Core normalizes one immutable bounded graph

Before opening a transaction or invoking Runtime behavior, Core traverses the
complete declared command input and creates one immutable, callback-free,
application-owned graph. Every statically known node retains its exact schema,
source field, command, target data or identity, declaration position, depth,
and dependency. It contains no transport request, resolver, adapter function,
policy object, authority option, or executable callback.

This pass rejects malformed command records, unavailable commands, missing or
foreign schema targets, duplicate and contradictory IDs, impossible inverse
disconnects, cyclic caller data, and configured depth or work limits. It does
not replace the ordinary structural and optional application validation that
each object mutation receives in Runtime.

Nested-write limits are Core Runtime validation options:

```ts
new UltimaBase({
	validation: {
		nestedWrites: {
			maxDepth: 5,
			maxOperations: 100,
		},
	},
	// schemas and plugins
})
```

The defaults are depth `5` and `100` operation nodes. `maxDepth` is a
non-negative safe integer, the root is depth zero, and only a nested target
object create or update advances depth. `maxOperations` is a positive safe
integer and includes the root, every child object mutation, every pointer
identity action, every relation membership action per declared target, and
`clear` as one action. A relation target create therefore counts its child
create and its membership connect separately. An inverse-pointer `set` or
`clear` also counts every target pointer update discovered by the protected
transactional preflight. Trusted configuration may raise either limit; direct
TypeScript, REST, and GraphQL execution all retain the same Core ceiling.

Core privately reserves the normal Runtime-generated UUID v7 for every nested
create while preparing the graph. This lets parent candidates and relation
Access observe stable logical Pointers before a child is persisted. Reserved
IDs are not accepted from public input, are never returned before commit, and
cannot be referenced by another public command. They therefore do not create a
provisional-reference protocol or allow caller-authored cyclic create graphs.

For an inverse relation mapped by a pointer, Core removes that mapped field
from the contextual nested-create input and injects the source Pointer itself.
The child still validates that generated field and applies its normal create
field Access. A caller cannot override the injected identity.

### One transaction contains ordinary object lifecycles

One outer automatic transaction owns the complete graph. Nested execution
inherits the exact application, request context values, anonymous or audited
Master authority, cancellation signal, transaction identity, callback
attribution, and Hook lease. It never opens a sibling transaction and never
calls a raw adapter.

Each root or child object is an ordinary singular create or update and crosses
its standalone structural validation, optional Validation, operation Access,
item Access, field Access, ACL, protected constraints, input resolution,
before Hooks, persistence rewrite, adapter write, after Hooks, materialization,
and event buffering exactly once. Root authorization grants nothing to a child.
Master bypasses authorization for every node but retains validation, Hooks,
transactions, constraints, and integrity maintenance.

The coordinator schedules those lifecycles as follows:

1. Normalize and statically bound the complete declared graph.
2. Open the outer transaction, reserve create IDs, and build the root's logical
   pointer candidates and relation changes. Start the root lifecycle, run its
   initial structural validation and initial Access, and, on update, load and
   lock its visible target and run item Access.
3. Before the first business Hook or mutation write, perform protected reads
   for every existing connect target, current pointer-update target, relation
   update membership, and replacement membership. Expand inverse-pointer
   `set` and `clear` into their ordinary target updates, then reject the whole
   graph if the exact expanded work exceeds `maxOperations`.
4. Resolve pointer prerequisites in source field order. A pointer `create`
   runs the child's complete recursive create lifecycle; a pointer `update`
   runs the currently linked target's complete recursive update lifecycle.
5. Resume root field and schema input resolution, prepared transforms, final
   structural and optional application validation, value-dependent monotonic
   enforcement, and root `beforeOperation` Hooks.
6. Persist the root once. An update containing only nested work still advances
   the root's generated update timestamp once and remains one root update
   lifecycle.
7. Resolve relation fields in source declaration order. Within each field run
   `create`, `connect`, `update`, then `disconnect`; or run the exclusive
   `set`/`clear`. Child creates and updates use complete recursive lifecycles.
   Owning edges are written only after both identities exist. Inverse pointer
   membership uses ordinary target pointer updates.
8. Run the root `afterOperation` Hooks after every descendant and membership
   change. The hook receives the complete selection-independent root item and
   original item plus the immutable normalized operation graph; it receives no
   hydrated relation result. Queries started by that hook observe the final
   transactional graph.
9. Perform the existing caller-facing `select` and `include` projection by the
   root's adapter-proven identity, without replaying root mutation Access or
   Hooks, then commit and deliver buffered post-commit events.

Source relation field Access runs during the root's initial enforcement before
child Hooks or writes. It receives one immutable change per normalized command
in the fixed command order. The relation-write change vocabulary adds
`create` and `update` beside `connect`, `disconnect`, `set`, and `clear` so a
policy never has to infer traversal intent. Reserved child IDs make the target
identities available for `create` changes. Every connect target is separately
read through protected target visibility. Every nested relation update must
also prove that its target is currently visible through that exact source
relation before the target update lifecycle begins.

Any normalization, Access, ACL, validation, Hook, target, relation, adapter,
projection, cancellation, or finalization failure rolls back every root,
child, edge, Hook-started database operation, and buffered event. There is no
partial-success result.

### REST keeps concise bodies and replaces pointer mutation tags

REST create and patch bodies use the same command property names. Pointer
identity commands carry one UUID v7 string; relation identity commands carry
arrays of UUID v7 strings; relation update items use `{ "id", "data" }`.
Nested create and update data recursively reuse the target schema's existing
REST scalar, embedded object, list, and plugin-field codecs.

```json
{
	"author": { "connect": "0199b4f0-5a31-7000-8000-000000000001" },
	"comments": {
		"create": [{ "body": "First" }],
		"connect": ["0199b4f0-5a31-7000-8000-000000000002"]
	}
}
```

The tagged pointer input
`{ "type": "pointer", "className": "User", "id": "..." }` is removed from
REST mutation input with no alias. Tagged unloaded-pointer output remains
unchanged. REST continues to own JSON/media/body failures before Runtime; Core
`VALIDATION_ERROR`, protected `NOT_FOUND`, permission, cancellation, and
internal failures keep ADR-0228's mappings and redaction. `select` and
`include` shape only the completed root result.

### GraphQL generates source-field-specific nested inputs

For a `Post.author -> User` pointer and `Post.comments -> Comment` relation,
GraphQL generates these stable forms:

```graphql
input PostAuthorNestedCreateInput {
	connect: ID
	create: UserCreateInput
}

input PostAuthorNestedUpdateInput {
	connect: ID
	create: UserCreateInput
	update: UserUpdateInput
	disconnect: Boolean
}

input PostCommentsNestedCreateTargetInput {
	# Comment create fields; an inverse mappedBy pointer is omitted and injected.
}

input PostCommentsNestedCreateInput {
	create: [PostCommentsNestedCreateTargetInput!]
	connect: [ID!]
}

input PostCommentsNestedUpdateItemInput {
	id: ID!
	data: CommentUpdateInput!
}

input PostCommentsNestedUpdateInput {
	create: [PostCommentsNestedCreateTargetInput!]
	connect: [ID!]
	update: [PostCommentsNestedUpdateItemInput!]
	disconnect: [ID!]
	set: [ID!]
	clear: Boolean
}
```

The outer pointer field remains non-null in a create input exactly when the
pointer is required and has no default. Required-pointer update inputs omit
`disconnect`. Relation fields remain optional. GraphQL input nullability
cannot express exclusive commands, non-empty arrays, or a literal-true
sentinel, so runtime decoding applies the same Core rules and rejects explicit
null command members and `false` sentinels before Runtime effects.

Nested target create and update fields recursively use the same schema-aware
compiler and existing scalar update wrappers. Source-field-specific target
create types exist because an inverse `mappedBy` pointer must be omitted from
caller input. Lazy named construction supports circular schema declarations;
it does not create cyclic mutation values or expose an otherwise disabled root
operation.

The former GraphQL pointer create `ID` and update `{ set: ID }` shapes are
replaced by these command inputs without aliases. Networkless and Yoga
execution both decode into the same Core graph through the narrow application
request executor. GraphQL validation/coercion errors retain its request-error
boundary; Core failures retain ADR-0238's safe extensions.

### Public relation handles also use field-bound IDs

`Relation.connect`, `disconnect`, and `set` accept one ID or their existing
cardinality-appropriate readonly ID arrays. They no longer accept `Pointer` or
persisted model targets, and no compatibility overload remains. `clear` is
unchanged. The handle still derives the exact target schema, builds the same
protected relation delta, and executes the existing source update lifecycle.

This removal does not remove `Schema.pointer()`, `Pointer`, `toPointer()`, or
pointer equality and Query APIs. Those are logical value and identity tools,
not necessary arguments when a relation handle already knows its target.

## Consequences

- Aggregate creation and update become one concise operation without creating
  a transport- or adapter-specific execution path.
- One root Hook lifecycle surrounds deterministic child lifecycles, and the
  root after Hook can query the transaction-final relationship state.
- Reserving private IDs preserves parent-first authorization and pointer
  candidate validation without exposing provisional references.
- Source relation Access can distinguish nested target creation, update, and
  membership changes; this deliberately expands its typed change union.
- Direct TypeScript and both public transports share conflict, depth, work,
  rollback, and protected-not-found behavior.
- The pre-release relation-handle, REST pointer-input, and GraphQL pointer-input
  replacements are breaking changes with no compatibility aliases.

## Non-goals

- Nested target delete or upsert.
- Nested data in create-many, update-many, upsert, or other root commands.
- Caller-visible temporary references, client-supplied IDs for creates, or
  cyclic create graphs.
- Connect or target selection by arbitrary unique filters.
- Partial success, reordered parallel child execution, or adapter-native nested
  mutation syntax.
- Hidden edge metadata; relationships with data remain explicit schemas.
