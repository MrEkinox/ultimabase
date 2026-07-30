# ADR-0017: Composite fields and PostgreSQL storage

- Status: accepted
- Date: 2026-07-30

## Decision

Schema exposes storage-neutral `jsonField`, `objectField`, and `arrayField`
definitions. `objectField` composes existing field definitions, and both objects
and arrays may nest to any finite depth. Circular field definitions are invalid.

The PostgreSQL adapter will compile `jsonField`, `objectField`, and `arrayField`
to JSONB by default. A later PostgreSQL-specific extension may opt compatible
homogeneous scalar arrays into native PostgreSQL array storage without changing
the neutral Schema contract.

Nested `Date` values use an adapter-owned lossless codec. Nested indexes must be
compiled explicitly by an adapter or rejected during setup; an adapter must
never silently ignore them.

## Consequences

One structured object remains one logical field rather than becoming implicit
physical columns. UltimaBase owns recursive type inference and validation,
while Drizzle only receives database metadata after the PostgreSQL boundary.

JSONB provides consistent semantics for structured objects, arrays of objects,
and nested arrays. Native PostgreSQL arrays remain an explicit optimization
rather than changing the portable meaning of `arrayField`.
