# Milestone 50 — Query filter input transformation

- Status: completed
- Authorization: user request of 2026-09-26
- Baseline: `d7163520`

This milestone removes the duplicate Core-shaped filter traversal maintained by
the REST and GraphQL transports. Core owns only the transport-neutral structure
of logical filters, relationship predicates, relation counts, and structured
object paths. Each transport keeps its own wire codecs, malformed-input policy,
and public errors.

## Execution order

- [x] [5001 — Consolidate transport filter traversal](5001-consolidate-transport-filter-traversal.md)

## Constraints

- Preserve every accepted REST and GraphQL input and every current rejection.
- Keep JSON/HTTP, GraphQL, scalar, plugin-codec, and transport-error concepts out
  of Core.
- Add no new operator, filter syntax, transport fallback, or Runtime behavior.
- Stop and record the audit if the shared boundary does not delete production
  lines overall or requires transport policy adapters throughout Core.

No push is authorized.

## Outcome

Core now exports one immutable filter-input transformer. REST and GraphQL each
retain only their operand codec while Core traverses logic, relationships,
filtered counts, and structured paths. The implementation removes 208 and adds
172 production TypeScript lines, for a net reduction of 36 lines, while adding
focused runtime, type, REST, and GraphQL regression coverage.
