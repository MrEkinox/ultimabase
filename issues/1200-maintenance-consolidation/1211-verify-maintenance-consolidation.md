# 1211: Verify the maintenance consolidation

- Status: completed
- Milestone: 12
- Packages: repository, `@ultimabase/core`, `@ultimabase/typegen`, implemented official plugins
- Depends on: 1210
- ADR: all accepted foundational ADRs

## Goal

Prove that the maintenance milestone reduced verified debt without changing
the framework architecture, public behavior, or paused objectives.

## Acceptance criteria

- [x] Live roadmap, plan, milestone, package, and issue-status documentation agree with the repository state.
- [x] Every publishable workspace contains implemented behavior and relevant tests.
- [x] Built-in fields reject unsupported options, reserved names agree statically and at runtime, and invalid combinations report actionable diagnostics.
- [x] Removed Query aliases are absent from source and packed exports while canonical replacements preserve exact inference.
- [x] Query traversal, schema-model runtime, Runtime orchestration, and native Access dispatch have focused ownership with no public implementation leakage.
- [x] The mandatory Runtime order, immutable models, Access monotonicity, master boundary, automatic transactions, hooks, relations, and adapter contracts remain unchanged.
- [x] Touched production files introduce no `any`, deep import, speculative extension, or net increase in double assertions.
- [x] ACL packages and their paused issues retain their pre-milestone behavior and status.
- [x] Typegen issue 810 remains paused; only regression coverage required by touched public contracts is allowed.
- [x] The completed plan records remaining intentional hotspots rather than anticipating unproven abstractions.

## Tests

- [x] Repository typecheck, unit/type tests, lint, formatting, constraints, build, and package archives pass.
- [x] Source and packed language-service tests cover the hardened and removed public surfaces.
- [x] Complete PostgreSQL E2E passes locally or through the required CI runtime with recorded evidence.
- [x] Coverage is reviewed by responsibility; critical branches touched by the milestone receive focused tests instead of relying only on global thresholds.
- [x] The active plan is archived only after every issue and completion criterion is done.

## Validation evidence

- Roadmap, milestone, issue, package, and plan links resolve. Issues 1201 through
  1211 are done, the plan is archived, and no cross-milestone plan remains
  active.
- All nine publishable workspaces contain implementation source, colocated or
  package-level tests, and build and test scripts. Planned package identities
  remain issue-tracked without empty workspaces.
- Source and packed TypeScript language-service regressions protect strict
  built-in options, reserved-name parity, actionable option diagnostics,
  removed Query aliases, exact canonical replacements, and private extraction
  boundaries. The removed aliases are absent from production source and built
  Core declarations.
- The 52 production files touched since the maintenance plan began contain no
  explicit `any` or deep package import. Double assertions decrease from 58 to
  35; remaining erased boundaries are documented by their owning issues and
  focused tests.
- ACL permission, ACL PostgreSQL, roles, both paused plans, issue 432, and issue
  810 have no milestone diff. ACL hardening remains resumable at 432 and
  generated-schema performance verification remains paused at 810.
- Repository unit and type validation passes with 286 files and 1,813 tests and
  no type errors. Constraints, typecheck, lint, formatting, build, and
  Changesets validation pass.
- Coverage validation passes with 90.46% statements, 83.65% branches, 94.21%
  functions, and 90.61% lines. Touched responsibilities retain focused suites:
  built-in fields report 99.14% statement coverage, Query filters 92.32%,
  Runtime Access 89.71%, and Runtime pipeline 91.58%.
- Packed-package validation passes with 7 files and 47 tests. Complete built
  cross-package and PostgreSQL/Testcontainers E2E passes with 27 files and 124
  tests.

## Out of scope

- New product features.
- Resuming ACL hardening or Typegen performance verification.
- Declaring unrelated backlog issues complete.
