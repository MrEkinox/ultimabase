# ADR-0165: Embedded object fields contain value fields only

- Status: accepted
- Date: 2026-08-08
- Refines: ADR-0021, ADR-0030, ADR-0032, ADR-0051, ADR-0097, ADR-0118, ADR-0124

## Context

`objectField` represents one structured value stored and selected as part of
its parent field. Its children still reuse ordinary field inference,
validation, input resolution, and Access declarations. Some field capabilities
cannot preserve that meaning when embedded.

A pointer or relation owns relationship identity and traversal outside the
parent value. An auto-incrementing integer relies on a dedicated database
column and sequence. Treating either capability as a JSONB child would make the
static Schema contract promise behavior that Runtime and database adapters
cannot execute consistently.

Nested hooks and Access also need occurrence semantics. One declared child may
appear several times through object lists, so executing it once per declaration
would inspect neither the exact value nor the exact location being mutated or
returned.

## Decision

An `objectField` accepts embedded value fields only. Core rejects these child
definitions at both the TypeScript and runtime declaration boundaries:

- `pointerField` and `relationField`, including when nested through another
  object field;
- `intField({ autoIncrement: true })`; and
- `bigintField({ autoIncrement: true })`.

Relationships remain top-level schema fields. When a relationship itself needs
structured attributes, the developer declares an explicit relationship schema
with ordinary pointer fields and scalar metadata.

Nested field `resolveInput` and field Access execute for every concrete object
or list occurrence. Inputs expose the exact logical value and immutable field
path for that occurrence. Traversal remains deterministic: list order is
preserved, siblings use declaration order, and object children resolve before
their parent field.

The object remains one logical stored value. A database plugin may encode child
values through their portable codecs, but it does not create hidden child
columns or relationship storage. PostgreSQL compiles the complete object to one
JSONB column. Nested index or column-rename metadata remains adapter-specific;
PostgreSQL rejects unsupported nested metadata during setup instead of silently
ignoring it.

## Consequences

- Static autocomplete and untyped runtime input reject the same impossible
  embedded declarations.
- Nested Access and normalization observe real values rather than a synthetic
  aggregate callback.
- Pointer and relation loading stays in the relationship graph and cannot be
  confused with JSONB document hydration.
- Auto-increment generation remains backed by real top-level PostgreSQL
  columns.
- Future field kinds whose semantics require external identity or dedicated
  physical storage must be rejected as embedded values.
