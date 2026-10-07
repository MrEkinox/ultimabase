# ADR-0183: Bootstrap model identifiers are strings

- Status: accepted
- Date: 2026-08-10
- Refines: ADR-0175, ADR-0181, ADR-0182

## Context

Before code generation, Core exposes a deliberately minimal `BaseItem` rather
than inferring application fields. ADR-0175 initially represented its `id` as
`{ toString(): string }`, following a generic convention used by Keystone.

UltimaBase does not have a generic identifier abstraction. Framework-generated
object identifiers, pointers, `get`, and singular identifier aliases all use
strings. The broader structural contract therefore weakens bootstrap typing and
forces redundant `.toString()` calls without representing a real runtime value.

## Decision

`SchemaItemType.id` and `BaseItem.id` are `string` before and after code
generation:

```ts
export type BaseItem = Readonly<{
	readonly id: string
	readonly [key: string]: unknown
}>
```

Code generation remains authoritative for application fields, but it does not
replace the fundamental identifier primitive. The generated-contract ABI
version increments so stale declarations are detected.

## Consequences

- Bootstrap results pass their identifiers directly to `get`, pointers,
  relations, roles, `updateOne({ id })`, and `deleteOne({ id })`.
- Application fields other than `id` remain `unknown` until code generation.
- Core does not introduce a generic identifier interface or accept arbitrary
  stringifiable objects at operation boundaries.
- Existing `.toString()` calls remain valid JavaScript but are unnecessary and
  should not appear in framework examples or fixtures.
