# 1803: Compile portable plugin containment in PostgreSQL

- Status: completed
- Milestone: 18
- Packages: `@ultimabase/postgres-plugin`, `@ultimabase/core`, `@ultimabase/testing`
- Depends on: 1802
- ADR: ADR-0212

## Goal

Compile field-owned portable containment operands into parameterized PostgreSQL
JSONB predicates without importing or identifying the field plugin.

## Acceptance criteria

- [x] PostgreSQL advertises the exact Core protocol version, recognizes the accepted compiled field capability, and lowers the existing `contains` leaf to parameterized JSONB `@>`.
- [x] Containment uses the field-owned partial operand representation rather than the complete logical-value codec path.
- [x] Unsupported storage, stale versions, malformed operands, and mismatched field plans fail closed.
- [x] Generated GIN indexes remain usable and no raw SQL or Drizzle value crosses the public plugin boundary.
- [x] A community proof field executes containment without a database-specific bridge package.
- [x] PostgreSQL retains no ACL, roles, authentication, or concrete community-plugin import.
- [x] Built-in JSON/object containment and plugin complete-value equality remain unchanged.

## Tests

- [x] Compiler tests prove exact SQL shape, parameterization, logical `AND`/`OR`, invalid plans, and codec separation.
- [x] Testcontainers prove indexed containment through public source and built package exports.
- [x] Dependency and conformance tests prove the adapter remains product-neutral.

## Out of scope

- ACL-specific payloads or SQL.
- Reference-cleanup policy.
- Deleting the existing ACL bridge before issue 1804.
