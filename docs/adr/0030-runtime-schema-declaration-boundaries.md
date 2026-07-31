# ADR-0030: Runtime schema declaration boundaries

- Status: accepted
- Date: 2026-07-31

## Decision

Every public schema factory validates untyped JavaScript input before creating
immutable metadata. Common field options validate their container, presence
flags, nullability, indexing, descriptions, immutability, lists, extensions,
and static defaults. Built-in factories additionally validate their own scalar
defaults and specialized flags.

`defineSchema` and `objectField` validate complete field-definition trees,
including non-empty names, structural field metadata, namespaced plugin kinds,
and cycles. This is a declaration boundary rather than request validation.

Structured static defaults are normalized by their declared child fields.
Built-in fields reuse their scalar snapshot behavior. Plugin fields reuse the
`normalizeValue` callback registered by `definePluginField`; that callback must
return a detached value when its logical type is mutable. Hand-written plugin
field objects are not a supported extension boundary.

Validation-plan compilation reapplies the same field-aware snapshot contract,
so mutable binary or plugin values inside schema metadata are not shared with
the compiled plan.

Native regular expressions are copied and frozen in string field metadata.
Compiled plans expose an immutable `{ source, flags }` descriptor so runtime
validators never share stateful `lastIndex` behavior with schema declarations.

## Consequences

TypeScript and JavaScript consumers receive the same declaration invariants.
Invalid metadata cannot silently alter required-field or auto-increment plans.
Object defaults reject unknown, missing, or incorrectly typed child values.

Plugin authors have one explicit scalar snapshot boundary. Schema retains a
weak association with each immutable plugin field definition without adding
application-global state or database knowledge.
