# ADR-0023: Portable UUID fields

- Status: accepted
- Date: 2026-07-31
- Default contract superseded in part by: ADR-0038

## Decision

Schema exposes `uuidField()` as a storage-neutral developer field whose
TypeScript value is a canonical UUID string. Its optional
`validation.version` accepts UUID versions 1 through 8 and remains declarative
metadata for runtime validators. An omitted version accepts every standard
UUID version.

Generation uses the existing static, runtime, or database default contract.
The field does not expose PostgreSQL generation expressions or storage
options. The reserved `id` field keeps its framework-owned UUID v7 generation
metadata, while both system and developer UUIDs compile into the same
transport-neutral validation-plan shape.

PostgreSQL adapters map the logical field to the native `uuid` type. Database
specific generation strategies remain adapter extensions rather than Schema
options.

## Consequences

Applications can model UUID foreign identifiers and domain values without
falling back to unconstrained strings. Version restrictions, lists, defaults,
indexes, nullability, and operation-specific inference reuse existing field
contracts.

UUID parsing and value validation execute later in the runtime pipeline, so
declaring a field never executes business validation or generation behavior.
