# 1211: Verify the maintenance consolidation

- Status: ready
- Milestone: 12
- Packages: repository, `@ultimabase/core`, `@ultimabase/typegen`, implemented official plugins
- Depends on: 1210
- ADR: all accepted foundational ADRs

## Goal

Prove that the maintenance milestone reduced verified debt without changing
the framework architecture, public behavior, or paused objectives.

## Acceptance criteria

- [ ] Live roadmap, plan, milestone, package, and issue-status documentation agree with the repository state.
- [ ] Every publishable workspace contains implemented behavior and relevant tests.
- [ ] Built-in fields reject unsupported options, reserved names agree statically and at runtime, and invalid combinations report actionable diagnostics.
- [ ] Removed Query aliases are absent from source and packed exports while canonical replacements preserve exact inference.
- [ ] Query traversal, schema-model runtime, Runtime orchestration, and native Access dispatch have focused ownership with no public implementation leakage.
- [ ] The mandatory Runtime order, immutable models, Access monotonicity, master boundary, automatic transactions, hooks, relations, and adapter contracts remain unchanged.
- [ ] Touched production files introduce no `any`, deep import, speculative extension, or net increase in double assertions.
- [ ] ACL packages and their paused issues retain their pre-milestone behavior and status.
- [ ] Typegen issue 810 remains paused; only regression coverage required by touched public contracts is allowed.
- [ ] The completed plan records remaining intentional hotspots rather than anticipating unproven abstractions.

## Tests

- [ ] Repository typecheck, unit/type tests, lint, formatting, constraints, build, and package archives pass.
- [ ] Source and packed language-service tests cover the hardened and removed public surfaces.
- [ ] Complete PostgreSQL E2E passes locally or through the required CI runtime with recorded evidence.
- [ ] Coverage is reviewed by responsibility; critical branches touched by the milestone receive focused tests instead of relying only on global thresholds.
- [ ] The active plan is archived only after every issue and completion criterion is done.

## Out of scope

- New product features.
- Resuming ACL hardening or Typegen performance verification.
- Declaring unrelated backlog issues complete.
