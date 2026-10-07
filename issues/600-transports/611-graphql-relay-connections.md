# 611: Implement GraphQL-owned Relay connections

- Status: completed
- Milestone: 6
- Packages: `@ultimabase/graphql-plugin`
- Depends on: 610
- ADR: ADR-0010, ADR-0227 and ADR-0238

## Goal

Implement the accepted Relay-style connection protocol entirely inside the
GraphQL package and translate pages into ordinary Core Query clauses.

## Acceptance criteria

- [x] Connection fields expose the exact accepted edges, nodes, cursor,
      `pageInfo`, and count behavior without adding pagination metadata to Core.
- [x] Cursor payloads, ordering, tie-breaking, integrity checks, expiry or
      invalidation behavior, and forward arguments match the issue 608 contract.
- [x] A cursor is opaque on the wire, schema- and ordering-bound where required,
      and cannot select another application, schema, policy context, authority,
      or arbitrary Query clause.
- [x] Every page normalizes into existing filters, ordering, limit, and offset
      clauses; Core gains no cursor token, codec, AST node, implicit ordering,
      or adapter-specific keyset API.
- [x] Empty pages, exact boundaries, null ordering, deletions or insertions
      between pages, malformed cursors, and unsupported reverse pagination have
      the documented deterministic behavior.
- [x] Relationship connections reuse the same protocol and preserve target
      Access, ACL, selection, and inclusion semantics through Runtime rather
      than evaluating policy in GraphQL.

## Tests

- [x] Multi-page networkless fixtures cover custom ordering, duplicate ordered
      values, boundary pages, malformed and foreign cursors, relationships,
      parallel applications, and PostgreSQL execution.

## Out of scope

- Reintroducing a transport-neutral Core cursor or changing REST v1 pagination.
