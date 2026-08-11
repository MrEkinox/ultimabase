# ADR-0171: Field Access authorizes value transitions

- Status: accepted
- Date: 2026-08-08
- Refines: ADR-0170
- Refined by: ADR-0194

## Context

ADR-0170 separated field writes into a create branch and update transitions.
That retained schema-operation vocabulary inside a field policy even though
field authorization answers a value-state question. With canonical `null`, a
non-null value supplied during creation and a later `null` to non-null update
are the same transition: both fill an empty field.

Keeping both `write.create` and `write.update.fill` made developers repeat one
policy or invent a distinction that belongs to schema Access.

## Decision

Generic field `write` accepts a concise boolean or the complete
`{ fill, replace, clear }` transition map directly.

- `fill` protects every empty-to-non-null transition, including a non-null
  value materialized by the create branch;
- `replace` protects non-null-to-non-null updates;
- `clear` protects every update ending in canonical `null`.

A create candidate whose field is absent or `null` performs no field write.
Upserts select the same transition only after their actual create or update
branch is known. Schema `create` and `update` Access remain available when a
policy genuinely depends on the operation rather than the field value state.

Relation fields keep `write({ change })` because their edge deltas are not
scalar value transitions.

## Consequences

- Field Access exposes only disclosure and value-transition concepts.
- The same `fill` rule protects initial and later assignment consistently.
- Operation-specific field policies move to schema item Access, where complete
  materialized items are available.
- The pre-release API rejects the intermediate `{ create, update }` write
  shape introduced by ADR-0170.
