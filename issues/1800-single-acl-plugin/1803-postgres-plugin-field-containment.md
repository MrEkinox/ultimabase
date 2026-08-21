# 1803: Compile portable plugin containment in PostgreSQL

- Status: planned
- Milestone: 18
- Packages: `@ultimabase/postgres-plugin`, `@ultimabase/core`, `@ultimabase/testing`
- Depends on: 1802
- ADR: decision from issue 1801

## Goal

Compile field-owned portable containment operands into parameterized PostgreSQL
JSONB predicates without importing or identifying the field plugin.

## Acceptance criteria

- [ ] PostgreSQL advertises the exact Core protocol version, recognizes the accepted compiled field capability, and lowers the existing `contains` leaf to parameterized JSONB `@>`.
- [ ] Containment uses the field-owned partial operand representation rather than the complete logical-value codec path.
- [ ] Unsupported storage, stale versions, malformed operands, and mismatched field plans fail closed.
- [ ] Generated GIN indexes remain usable and no raw SQL or Drizzle value crosses the public plugin boundary.
- [ ] A community proof field executes containment without a database-specific bridge package.
- [ ] PostgreSQL retains no ACL, roles, authentication, or concrete community-plugin import.
- [ ] Built-in JSON/object containment and plugin complete-value equality remain unchanged.

## Tests

- [ ] Compiler tests prove exact SQL shape, parameterization, logical `AND`/`OR`, invalid plans, and codec separation.
- [ ] Testcontainers prove indexed containment through public source and built package exports.
- [ ] Dependency and conformance tests prove the adapter remains product-neutral.

## Out of scope

- ACL-specific payloads or SQL.
- Reference-cleanup policy.
- Deleting the existing ACL bridge before issue 1804.
