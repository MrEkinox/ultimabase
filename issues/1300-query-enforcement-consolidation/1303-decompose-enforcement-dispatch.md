# 1303: Decompose policy-neutral Enforcement dispatch

- Status: completed
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

- [x] Low-level guard, constraint, input, selection, and output contribution evaluation has focused internal ownership.
- [x] Direct and recursive relation-predicate enforcement has focused ownership while preserving source field Access and target-private enforcement state.
- [x] Mutation input denial, operation selection narrowing, pre-hook result hiding, and final output restriction have focused internal ownership.
- [x] `createEnforcementStages` retains only application validation, immutable composition, native Access delegation, and the established stage contract.
- [x] Guards remain deny-only, constraints remain append-only with logical `AND`, and input, selection, and output fields remain intersection-only.
- [x] Initial evaluation, value-dependent reevaluation, selection hiding, business output transformation, and final output restriction order remains unchanged.
- [x] Relation quantifiers, emptiness, grouped filtered cardinality, nested target Access, and constraint propagation retain their current semantics.
- [x] Master bypass remains contribution-owned and occurs before invocation; Runtime gains no policy-specific bypass branch.
- [x] No ACL, role, authentication, permission-provider, new stage, public export, adapter capability, or extension point is introduced.
- [x] No file in `acl-permissions-plugin`, `acl-postgres-plugin`, or `roles-plugin` is changed.
- [x] Touched production assertion counts do not increase and every remaining erased boundary is documented.

## Tests

- [x] Focused suites cover every contribution kind, monotonic accumulation, reevaluation, malformed returns, input denial, selection hiding, and output restriction.
- [x] Relation tests cover direct and nested quantifiers, filtered cardinality, source Field Access, target row filters, constraints, and master behavior.
- [x] Existing native Access, Runtime order, hooks, transactions, relations, ACL, roles, and PostgreSQL enforcement tests pass unchanged.
- [x] Coverage is reviewed by extracted responsibility and critical branches receive focused tests.
- [x] Source and packed declarations prove no private implementation type leaks publicly.
- [x] Repository checks, package archives, and complete PostgreSQL/Testcontainers E2E pass before the active plan is archived.

## Validation evidence

- `runtime/enforcement/dispatcher.ts` decreases from 741 to 88 lines and now
  owns only application validation, immutable stage composition, and native
  Access delegation. Contribution evaluation, operation restrictions,
  recursive relation planning, and result restrictions have separate focused
  internal modules.
- Focused tests protect all five contribution kinds, monotonic reevaluation,
  malformed returns, master bypass before invocation, every mutation input
  shape, direct and batched selection narrowing, pre-hook hiding, and final
  output intersection.
- New relation-planning regressions protect direct and nested quantifiers,
  filtered cardinality, source relation Field Access, target row filters, and
  target plugin constraints. Existing Access and PostgreSQL suites retain
  emptiness, visible cardinality, nested policy, and master semantics.
- Extracted Enforcement coverage reaches 96.07% statements, 89.5% branches,
  96.05% functions, and 96.06% lines. Focused Enforcement, Access, and Runtime
  validation passes with 7 files and 74 tests.
- Repository unit and type suites pass with 290 files and 1,819 tests. Overall
  coverage passes at 90.59% statements, 83.88% branches, 94.44% functions, and
  90.74% lines.
- Core's built `index.d.ts` remains byte-identical with SHA-256
  `95cdae76eeb73c73723669256bb308e1213fc31da8e7e93d028fcbba2a310ed8`.
  Source and packed negative tests prove every extracted coordinator remains
  private.
- Packed-package validation passes with 7 files and 50 tests. Complete built
  cross-package and PostgreSQL/Testcontainers E2E passes with 27 files and 127
  tests.
- Constraints, typecheck, lint, formatting, build, Changesets validation, and
  diff checks pass. The three production double assertions and two `never`
  erasures are unchanged, documented, and colocated with their original
  invariants.
- No file in ACL or Roles plugins changes. No `any`, deep import, public API,
  Runtime order, stage, bypass, adapter contract, or product behavior is added.

## Out of scope

- New Access declarations, enforcement contribution kinds, provider contracts, or bypass modes.
- ACL hardening issues 432 through 435.
- Refactoring Runtime Validation, hook boundaries, or PostgreSQL constraint compilation.
