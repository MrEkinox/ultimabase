# 1210: Decompose native Access dispatch responsibilities

- Status: planned
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1209
- ADR: ADR-0116, ADR-0120, ADR-0167 through ADR-0171

## Goal

Separate native operation/filter decisions, mutation-field transitions, item
checks, and output restrictions while retaining one policy-neutral native
Access runtime.

## Acceptance criteria

- [ ] Operation and filter rule evaluation has focused internal ownership.
- [ ] Create fills, update replacements, clears, field references, and relation writes share focused mutation-transition ownership.
- [ ] Item checks and final output/selection restrictions have focused internal ownership.
- [ ] `NativeAccessRuntime` owns composition and application-local state instead of every low-level algorithm.
- [ ] Master bypass, deny semantics, target-aware re-evaluation, monotonic filters, field restrictions, and hidden cardinality remain unchanged.
- [ ] Runtime does not gain ACL, role, authentication, permission-provider, or neutral placeholder behavior.
- [ ] No file in `acl-permissions-plugin`, `acl-postgres-plugin`, or `roles-plugin` is changed by this issue.
- [ ] Remaining assertions at generic operation boundaries are documented and protected; touched production assertion counts do not increase.

## Tests

- [ ] Focused suites cover operation, filter, item, field transition, output, master, and malformed-boundary behavior.
- [ ] Existing native Access, Runtime, hook, relation, and PostgreSQL Access tests pass.
- [ ] Core public exports and declarations remain unchanged.

## Out of scope

- ACL hardening issues 432 through 435.
- Field Access sibling dependencies from issue 439.
- New Access declarations, provider contracts, or bypass modes.
