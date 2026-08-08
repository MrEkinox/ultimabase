# ADR-0096: Native hook declaration capabilities

- Status: accepted
- Date: 2026-08-02
- Refines: ADR-0033, ADR-0088, ADR-0089, ADR-0090, ADR-0095
- Refined by: ADR-0097, ADR-0101, ADR-0172

## Context

ADR-0089 selected native schema and inline field hooks, while ADR-0095 moved
Schema, Query, and Runtime into one cohesive Core package. The remaining
boundary must preserve exact TypeScript inference without placing callback
functions in physical schema metadata or coupling declaration code to Runtime
execution.

The issue 324 prototype exercises the intended constructor and field-factory
syntax through both source declarations and the built `@ultimabase/core`
package. It proves that schema callbacks can infer create, update, object,
Query, operation, and correlated result shapes. Inline callbacks infer scalar,
enum, object, multidimensional list, nullable, and plugin-defined logical
values without access to sibling fields.

## Decision

### Public declaration boundary

`SchemaOptions` accepts `hooks: SchemaHooks<TSchema>`, and common field options
accept `hooks: FieldHooks<TField>`. The contextual schema type is synthesized
from the exact class name, fields, and extensions. `NoInfer` prevents callback
bodies from widening any of those declaration inputs.

The public contract uses the names `SchemaHooks`, `FieldHooks`,
`SchemaHookTypes`, `FieldHookTypes`, `SchemaHookOperation`, and
`SchemaHookResult`. `HookContext` is reserved for the immutable capability
class introduced after the dispatcher and transaction lifetime exist. No
temporary context class exposes a raw `RequestEngine`, adapter, master key, or
commit primitive.

Operation-family handlers preserve the exact terminal `kind`. Result handlers
retain the correlation between one operation and `InferOperationResult` for
that operation. Find handlers are generic over the accumulated selected-field
union so returning `query.limit(...)` does not erase selection inference.

Field hook types are derived from the completed field definition rather than
inferred from the callback. This keeps exact scalar values, enum literals,
object create/update/object modes, nullability, list dimensions, generated and
immutable presence, and custom plugin values. Inline hooks never claim sibling
schema knowledge; cross-field behavior belongs to schema hooks.

An absent field value is represented explicitly rather than as a fabricated
`undefined` value:

```ts
type FieldValueState<TValue> =
	| { readonly present: true; readonly value: TValue }
	| { readonly present: false }
```

This representation lets `onChange` distinguish creation, replacement, and a
real unset while omitted fields do not execute value hooks.

### Identity-owned immutable storage

The `hooks` option is consumed during declaration and never appears in
`SchemaDefinition`, `FieldDefinition`, `field.options`, extensions, validation
plans, indexes, hashes, migrations, or physical schema diffs. Schema owns a
private capability `WeakMap` keyed by exact `Schema` identity. Field factories
extend the existing field capability map instead of creating a second registry.

Declaration objects, phase maps, family maps, and handler lists are copied and
frozen while function identity is retained. Internal Schema-domain readers
return the normalized declaration or `undefined`; no neutral hook is created.
Unknown phases and malformed handlers fail at declaration time with a precise
path.

### Runtime and plugin resolution

The Schema domain owns declaration contracts and may import Query and operation
types. It never imports Runtime execution, a database, or a concrete plugin.
Core's Runtime domain reads the private capabilities internally, resolves exact
schema and field identity, and composes native declarations with owner-scoped
plugin contributions.

Extensions remain opaque configuration. An extension-targeted plugin uses them
only as initialization selectors; extension payloads never enter native hook
inputs or hovers. Business hooks and monotonic enforcement effects share one
dispatcher but remain distinct contracts. `SchemaHooks` and `FieldHooks` do not
contain CLP, ACL, role, guard, adapter-constraint, or field-restriction types.

Every supported public symbol is exported only from `@ultimabase/core`. Internal
Schema and Runtime folders remain private package paths.

## Consequences

- Issues 325 and 326 can add real declaration storage without changing schema
  or field inference contracts.
- Compact field hovers remain independent from callback literals and plugin
  extension payloads.
- Runtime can execute native and plugin hooks without introducing a package or
  internal source cycle.
- Query selection and operation/result correlation remain explicit regression
  targets for source and packed-package language-service tests.
- Hook-only changes never trigger database synchronization or migrations.
