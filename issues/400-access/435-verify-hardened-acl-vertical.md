# 435: Verify the hardened ACL vertical

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/core`, `@ultimabase/acl-permissions-plugin`, `@ultimabase/roles-plugin`, `@ultimabase/postgres-plugin`, `@ultimabase/testing`
- Depends on: 144, 351, 429, 430, 431, 432, 433, 434
- ADR: all accepted ACL and Access ADRs

## Goal

Close the ACL consolidation milestone with one public-export proof covering the
security, provider composition, developer experience, cleanup, and event
semantics discovered by the post-implementation audit.

## Acceptance criteria

- [ ] Master cannot bypass ACL mutation-shape invariants while retaining authorization bypass.
- [ ] Principal and role providers compose independently from configuration order and plugin implementation names.
- [ ] ACL default and input callbacks expose concise, schema-aware hover types and documented create/update semantics.
- [ ] Cleanup is bounded, transactionally complete under the accepted concurrency contract, and preserves unrelated grants.
- [ ] Optional ACL events require no synthetic consumer and remain post-commit only.
- [ ] Public, authenticated, exact principal, role, relation, pointer, cursor, bulk, upsert, RoleSchema, rollback, and application-isolation paths remain covered.
- [ ] Core imports no ACL, authentication, or roles implementation and public declarations contain no `any`.
- [ ] ACL documentation and ADR refinement links contain no conflicting current behavior.

## Tests

- [ ] Focused source coverage identifies genuinely uncovered paths separately from packed PostgreSQL E2E execution.
- [ ] Repository typecheck, tests, lint, formatting, constraints, build, packed-package checks, and complete PostgreSQL E2E pass.
- [ ] The active plan is archived only after every dependency and completion criterion is verified.
