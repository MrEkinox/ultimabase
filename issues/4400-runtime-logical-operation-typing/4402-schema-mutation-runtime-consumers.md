# 4402: Remove schema-mutation Runtime casts

- Status: completed
- Milestone: 44
- Packages: `@ultimabase/core`, `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`, `@ultimabase/acl-permissions-plugin`
- Depends on: 4401
- ADR: ADR-0245, ADR-0259, ADR-0272

## Goal

Adopt the truthful logical-operation contracts in the schema-mutation pipeline
and official engines, removing forced casts and duplicate stage envelopes.

## Acceptance criteria

- [x] Schema-mutation Runtime dispatch uses typed stage inputs and results.
- [x] Official Access and Hooks narrow logical operations without bridge casts.
- [x] Exact schema-mutation identity, target, outcome, and result behavior remain unchanged.
- [x] Focused Runtime and compile-time regressions pass.
- [x] Documentation impact is recorded.

## Out of scope

- Redesigning Access or Hooks authoring contracts.
- Reordering or merging the schema-mutation pipeline.
- Removing unrelated assertions required at untrusted adapter boundaries.

## Outcome

The schema-mutation pipeline now constructs exact shared-stage inputs instead
of coercing its logical operation, target, outcome, and result into native CRUD
types. Access and Hooks discriminate the closed logical union once, then route
schema mutations and native operations to their existing dedicated engines.
Opaque prepared targets and upsert materializations are validated before the
native Access path consumes them.

ACL field traversal now understands the update effect carried by a logical
schema mutation, so its protected field remains deny-only without an AST cast.
Alternative-engine fixtures explicitly decline the custom mutation family they
do not implement.

The sole remaining double assertion in the schema-mutation executor is the
adapter `prepare()` return boundary. Its public protocol is intentionally
opaque and the assertion is unrelated to logical-stage dispatch.

## Validation

- `yarn typecheck`
- `yarn workspace @ultimabase/core typecheck:tests`
- `yarn workspace @ultimabase/core test:types` (67 files, 132 tests)
- Focused Runtime suite (6 files, 30 tests)
- `yarn lint` (the three errors exposed by the widened contracts were corrected;
  repository warnings remain for pre-existing file budgets)

## Documentation impact

Internal engineering documentation. Issue 4401 already updated the Core README
and public Runtime Pipeline page for the logical-operation contract; this issue
aligns implementations and tests with that documented contract without adding
another public configuration shape or lifecycle behavior.
