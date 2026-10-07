# ADR-0093: Immutable Schema constructor API

- Status: superseded
- Date: 2026-08-02
- Refines: ADR-0002, ADR-0005, ADR-0030
- Superseded by: ADR-0109

## Context

UltimaBase already represents `Query`, `ACL`, and `Role` as public domain
classes, while static schemas were declared through the `defineSchema`
factory. The mismatch made the foundational API less predictable and prevented
schemas from participating naturally in the framework's class-oriented object
model.

The project is still pre-release, so retaining both construction styles would
add compatibility code and documentation before any stable consumer requires
it.

## Decision

`@ultimabase/schema` exports an immutable `Schema` class. Developers declare a
schema exclusively with `new Schema(options)`. The constructor preserves the
exact class-name, field-map, index, and extension inference previously provided
by `defineSchema`, validates the same JavaScript declaration boundary, copies
caller-owned containers, adds framework system fields, and freezes the final
instance.

`defineSchema` is removed rather than deprecated. Stateless field, extension,
hook, and plugin declarations remain factories because they do not represent
public domain objects with their own identity.

`SchemaDefinition` remains the infrastructure-neutral structural contract used
by foundational package generics. Untrusted runtime boundaries nevertheless
require constructor provenance through `Schema.is(value)`. The constructor
installs a non-enumerable, versioned marker shared across duplicate package
loads, so an object that merely copies `className` and `fields` cannot enter a
registry, query, hook, or runtime operation. Regular application code receives
an actual `Schema` instance and may also use `instanceof Schema` when both values
come from the same package copy.

This decision does not turn persisted records into Active Record objects.
Queries and persistence still pass through `Query` and `RequestEngine`. Compact
query hovers are a separate type-presentation concern and must not weaken schema
inference merely to hide constructor parameters.

## Consequences

The public declaration becomes consistent with UltimaBase's class-based domain
API:

```ts
const PostSchema = new Schema({
	className: 'Post',
	fields: {
		title: stringField(),
	},
})

const query = new Query(PostSchema)
```

Existing pre-release code must replace `defineSchema({...})` with
`new Schema({...})`. There is one construction path to document, test, and
maintain. Schema identity, registry isolation, inference helpers, validation
plans, adapter compilation, and runtime execution otherwise retain their
existing behavior.
