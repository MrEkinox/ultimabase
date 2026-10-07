# ADR-0239: GraphQL delete and upsert results keep Core projections

- Status: accepted
- Date: 2026-09-07
- Refines: ADR-0238
- Depends on: ADR-0225, ADR-0232, ADR-0238

## Context

ADR-0238 requires GraphQL model selections to become Core `select` and
`include` clauses. Core schema commands intentionally accept result inclusion
for create and update, but only flat selection for delete and upsert.

Adding inclusion to upsert would widen Core's public schema-command contract.
Adding it to delete is more consequential: relationships may no longer exist
after the write, so correct inclusion would require a new pre-delete result
snapshot and pipeline semantics. Loading relationships from GraphQL afterward
would create a second unrestricted read and bypass the single Runtime result.

## Decision

GraphQL v1 preserves Core's existing command boundary:

- create and update selections may use ordinary pointer and relation includes;
- delete and upsert selections may contain scalar fields and stored pointer
  identities;
- a stored pointer result may select only `id` and `__typename` without an
  include;
- relation selections and pointer expansion beyond identity on delete or
  upsert fail during pre-Runtime GraphQL normalization.

No Core command, Runtime stage, adapter contract, or materialization behavior is
widened by the GraphQL transport.

## Consequences

Generated delete and upsert fields continue to return the canonical schema
object type, but their executable projection is intentionally narrower than
create and update. Supporting hydrated relationship results for those commands
requires a separate Core design and accepted ADR before the GraphQL contract
can expose it.
