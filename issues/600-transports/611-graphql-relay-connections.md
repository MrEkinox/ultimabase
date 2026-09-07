# 611: Implement GraphQL-owned Relay connections

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/graphql-plugin`
- Depends on: 610
- ADR: ADR-0010, ADR-0227 and the issue 608 GraphQL v1 contract

## Goal

Implement the accepted Relay-style connection protocol entirely inside the
GraphQL package and translate pages into ordinary Core Query clauses.

## Acceptance criteria

- [ ] Connection fields expose the exact accepted edges, nodes, cursor,
      `pageInfo`, and count behavior without adding pagination metadata to Core.
- [ ] Cursor payloads, ordering, tie-breaking, integrity checks, expiry or
      invalidation behavior, and forward arguments match the issue 608 contract.
- [ ] A cursor is opaque on the wire, schema- and ordering-bound where required,
      and cannot select another application, schema, policy context, authority,
      or arbitrary Query clause.
- [ ] Every page normalizes into existing filters, ordering, limit, and offset
      clauses; Core gains no cursor token, codec, AST node, implicit ordering,
      or adapter-specific keyset API.
- [ ] Empty pages, exact boundaries, null ordering, deletions or insertions
      between pages, malformed cursors, and unsupported reverse pagination have
      the documented deterministic behavior.
- [ ] Relationship connections reuse the same protocol and preserve target
      Access, ACL, selection, and inclusion semantics through Runtime rather
      than evaluating policy in GraphQL.

## Tests

- [ ] Multi-page networkless fixtures cover custom ordering, duplicate ordered
      values, boundary pages, malformed and foreign cursors, relationships,
      parallel applications, and PostgreSQL execution.

## Out of scope

- Reintroducing a transport-neutral Core cursor or changing REST v1 pagination.
