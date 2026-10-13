# ADR-0175: Map-returning schema fields and generated typing authority

- Status: accepted
- Partially superseded by: ADR-0297 for the generated typing authority and its bootstrap typing (Typegen removed in migration step 6.8b, 2026-10-13)
- Date: 2026-08-09
- Refines: ADR-0173
- Refined by: ADR-0177, ADR-0217

This ADR supersedes ADR-0173's callback-timing and pre-compilation model
boundaries. ADR-0173 remains the historical decision that introduced the
generated registry and application-owned plugin method graph.

## Context

ADR-0173 introduced an imperative name-first FieldBuilder and retained a
separate field-map declaration for internal tests. That created two schema
shapes and still asked stable TypeScript to infer fields, Access, hooks, schema
identity, extensions, and recursive relationships in one circular expression.
The generated application contract already contains the exact public item and
operation types, so duplicating that work through local conditional inference
adds editor cost without adding runtime information.

## Decision

Every schema uses one map-returning declaration:

```ts
export const Todo = Schema.define({
	className: 'Todo',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
		completed: field.boolean({ default: false }),
	}),
})
```

The returned object owns field names. Builder methods receive only their field
options and return the same immutable definitions as the low-level factories.
Embedded object fields use the identical pattern with the restricted embedded
builder. Internal tests and framework packages do not receive a second public
field-map syntax.

Static declarations remain authoritative for runtime compilation. The
generated `Schemas.<Name>.TypeInfo` entry is authoritative for precise
application typing: item values, create and update inputs, where, orderBy,
select, include, relationships, Access, hooks, and plugin-contributed builder
methods resolve from that registry.

Before a generated registry exists, Core provides safe bootstrap typing. Field
factories and locally decidable schema options remain typed, while hook and
Access `item`/`originalItem` values use `BaseItem`:

```ts
export type BaseItem = {
	readonly id: { toString(): string }
	readonly [key: string]: unknown
}
```

Once code generation runs, the exact generated item replaces this fallback.
A loaded generated registry rejects schema names that are missing or stale.
Core does not attempt to reconstruct the complete application graph as a
fallback because doing so recreates the inference cycle this decision removes.
Schema specializations such as `RoleSchema.define()` follow the same boundary:
they retain explicit plugin capabilities and runtime metadata, but custom field
values remain bootstrap-unknown until the generated schema entry exists.

### Declaration and resolution lifecycle

`Schema.define()` executes each developer `fields` callback exactly once with
a capture builder. Built-in and generated plugin method calls become immutable
declarations containing the method name and supplied options; nested object
callbacks are captured through the same one-shot boundary. The callback is
never replayed by another application or by code generation.

Core immediately resolves a captured declaration containing only built-in
methods. Those ordinary schemas therefore retain synchronous `fields`, model
construction, Query, validation, and other pre-application behavior. When a
captured declaration uses a generated plugin method, the complete definition
remains deferred: application compilation first builds its owner-scoped plugin
method registry, then materializes the captured calls without executing the
developer callback again. A missing, conflicting, or incompatible plugin
method fails before plugin setup or infrastructure startup.

Validation of the callback's returned map happens at declaration time with the
complete `ClassName.fields.fieldName` path. Exceptions thrown by developer
callback code are reported as schema declaration failures, while invalid maps
remain direct input errors. Application-local materialization stays atomic and
reusing one schema class in another application must produce a compatible
definition.

## Consequences

- Application and test declarations have one visible structure.
- Developer field callbacks have one observable execution, independent of the
  number of applications that compile the schema.
- Built-in-only schemas remain immediately usable, while schemas using plugin
  methods wait for the configured application registry.
- Plugin methods such as `field.vector()` compose naturally as object values.
- Stable TypeScript avoids the largest recursive contextual-inference cycle.
- Hooks and Access intentionally require generation for exact application item
  fields; before generation, developers must narrow unknown values they use.
- Regeneration is part of startup and will later also be available through the
  deferred manual and watch CLI commands.
