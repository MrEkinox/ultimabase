# ADR-0022: Generator-neutral type identities

- Status: accepted
- Date: 2026-07-31

## Decision

Enum and object fields may declare an optional non-empty `typeName`. The value
identifies the logical type without coupling Schema to GraphQL, OpenAPI, SDKs,
or another generator.

When `typeName` is absent, each generator derives a deterministic name from the
owning schema and field path. When present, the generator uses it as a stable
base identity and may derive operation-specific variants such as output,
create-input, update-input, or filter types.

Schema preserves the exact string literal and rejects only empty or non-string
runtime values. Generator plugins validate their own naming grammar and detect
collisions during application setup, when every schema path and generated type
is known. Reusing one named field definition is valid; assigning one name to
incompatible definitions is a generator setup error.

List metadata wraps the same underlying named type and never changes its
identity.

## Consequences

Inline fields retain low-friction automatic naming, while reusable domain types
can opt into stable names. Schema remains independent from GraphQL naming rules,
and future generators can share the same declared identity without sharing
their derived naming conventions.
