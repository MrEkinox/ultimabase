# ADR-0055: Deterministic query clause normalization

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0004, ADR-0052

## Decision

Selection, ordering, and offset pagination normalize into immutable,
transport-neutral Query AST nodes. Every selected or ordered field is checked
against the exact schema at both the TypeScript and runtime boundaries.

Selection keeps the first occurrence of each field. Ordering keeps the position
of the first occurrence while the last occurrence determines its direction.
This makes order priority stable while allowing a later builder call to replace
an earlier direction without moving the field.

Limit is optional and, when present, must be a positive safe integer. Skip is
optional and must be a non-negative safe integer. A missing clause and a
skip-only value of zero normalize to no pagination node. The query package does
not define a maximum limit because that is an application or transport policy.

Normalized records and copied collections are frozen. Caller-owned values are
never mutated, and empty selection and ordering nodes may be safely shared.
Automatic primary-key ordering is deferred to cursor pagination, where the
stability requirement is concrete.

Pointer inclusion is deferred until the relationship target and pointer field
contracts are implemented by issues 701 and 702. Issue 737 then adds it at the
same normalization boundary with schema-aware pointer-only types. To-many
relations remain independently queried so inclusion cannot hide an unbounded
collection.

## Consequences

Direct TypeScript APIs, REST, GraphQL, permissions, and database adapters receive
one predictable clause representation. Invalid field names and pagination
values fail before reaching an adapter, while stable duplicate rules make
builder composition reproducible.

Runtime and transport packages may enforce stricter pagination limits without
changing the portable Query AST. Pointer inclusion later extends this
normalization boundary without defining a separate transport representation.
