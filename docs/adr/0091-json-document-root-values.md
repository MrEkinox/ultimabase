# ADR-0091: JSON fields require document roots

- Status: accepted
- Date: 2026-08-02
- Refines: ADR-0014, ADR-0019, ADR-0030
- Refined by: ADR-0136

## Context

The JSON standard and PostgreSQL `jsonb` accept scalar documents, so the first
`jsonField` contract exposed `string`, `number`, `boolean`, and `null` at the
field root. That made ordinary metadata fields unnecessarily broad and allowed
JSON `null` to appear without the framework's explicit nullable metadata.

Nested JSON still needs the complete portable value domain. Objects commonly
contain primitive properties and arrays commonly contain primitive or null
items.

## Decision

`jsonField` carries `JsonDocument`, defined as `JsonObject | JsonArray`, at its
root. Recursive members continue to use `JsonValue`, which includes documents,
strings, finite numbers, booleans, and `null`.

Root `null` is represented by every optional JSON field, consistently with
every other optional field kind. Runtime snapshots reject root scalars at the same
boundary that already rejects non-portable values, circular references, and
non-finite numbers.

Known structured data continues to use `objectField` for exact property
inference. A future scalar-capable JSON field, if justified by a concrete use
case, must use an explicit factory rather than widening `jsonField` again.

## Consequences

- Metadata-shaped JSON hovers expose `JsonObject | JsonArray` instead of every
  JSON primitive.
- Nested primitive and null values remain portable and deeply immutable.
- Existing root scalar JSON declarations are a deliberate breaking type and
  runtime change.
- PostgreSQL storage remains `jsonb`; only the portable schema boundary changes.
