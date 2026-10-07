# 355: Remove cursor pagination from Core Query

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 305
- ADR: ADR-0227

## Goal

Keep protocol-specific cursors outside Core and retain offset as the only
canonical Query pagination position.

## Acceptance criteria

- [x] Canonical `findMany` input accepts `limit` and `offset` without a cursor
      alternative.
- [x] `QueryBuilder`, Query AST, Core exports, and normalization expose no
      cursor method, node, codec, payload, helper, or error.
- [x] PostgreSQL compiles declared ordering, limit, filters, and offsets without
      implicit cursor ordering or cursor payload input.
- [x] JavaScript validation rejects `cursor` as an unknown `findMany` clause.
- [x] Source typing rejects `cursor` and `.after()` while retaining precise
      immutable offset typing.
- [x] Current Core, PostgreSQL, relation, and REST planning documentation
      reflects the transport boundary accepted by ADR-0227.
- [x] Issue 341 is superseded without deleting its historical proposal.

## Tests

- [x] Focused Core and PostgreSQL runtime and type tests pass.
- [x] Repository typecheck, tests, lint, formatting, and build pass.

## Out of scope

- Implementing REST, GraphQL, SDK iteration helpers, Relay connections, or a
  replacement keyset pagination protocol.
