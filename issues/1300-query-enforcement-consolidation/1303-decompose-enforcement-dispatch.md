# 1303: Decompose policy-neutral Enforcement dispatch

- Status: ready
- Milestone: 13
- Packages: `@ultimabase/core`
- Depends on: 1302
- ADR: ADR-0102, ADR-0116, ADR-0118, ADR-0120, ADR-0128, ADR-0156 through ADR-0158

## Goal

Separate low-level contribution evaluation, recursive relation enforcement,
mutation input restrictions, and result restrictions while retaining one
application-local composition boundary for native Access and policy-neutral
Enforcement.

## Acceptance criteria

- [ ] Low-level guard, constraint, input, selection, and output contribution evaluation has focused internal ownership.
- [ ] Direct and recursive relation-predicate enforcement has focused ownership while preserving source field Access and target-private enforcement state.
- [ ] Mutation input denial, operation selection narrowing, pre-hook result hiding, and final output restriction have focused internal ownership.
- [ ] `createEnforcementStages` retains only application validation, immutable composition, native Access delegation, and the established stage contract.
- [ ] Guards remain deny-only, constraints remain append-only with logical `AND`, and input, selection, and output fields remain intersection-only.
- [ ] Initial evaluation, value-dependent reevaluation, selection hiding, business output transformation, and final output restriction order remains unchanged.
- [ ] Relation quantifiers, emptiness, grouped filtered cardinality, nested target Access, and constraint propagation retain their current semantics.
- [ ] Master bypass remains contribution-owned and occurs before invocation; Runtime gains no policy-specific bypass branch.
- [ ] No ACL, role, authentication, permission-provider, new stage, public export, adapter capability, or extension point is introduced.
- [ ] No file in `acl-permissions-plugin`, `acl-postgres-plugin`, or `roles-plugin` is changed.
- [ ] Touched production assertion counts do not increase and every remaining erased boundary is documented.

## Tests

- [ ] Focused suites cover every contribution kind, monotonic accumulation, reevaluation, malformed returns, input denial, selection hiding, and output restriction.
- [ ] Relation tests cover direct and nested quantifiers, filtered cardinality, source Field Access, target row filters, constraints, and master behavior.
- [ ] Existing native Access, Runtime order, hooks, transactions, relations, ACL, roles, and PostgreSQL enforcement tests pass unchanged.
- [ ] Coverage is reviewed by extracted responsibility and critical branches receive focused tests.
- [ ] Source and packed declarations prove no private implementation type leaks publicly.
- [ ] Repository checks, package archives, and complete PostgreSQL/Testcontainers E2E pass before the active plan is archived.

## Out of scope

- New Access declarations, enforcement contribution kinds, provider contracts, or bypass modes.
- ACL hardening issues 432 through 435.
- Refactoring Runtime Validation, hook boundaries, or PostgreSQL constraint compilation.
