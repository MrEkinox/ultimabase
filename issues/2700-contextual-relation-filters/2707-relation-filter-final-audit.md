# 2707: Audit and close contextual relation filters

- Status: completed
- Milestone: 27
- Packages: repository-wide
- Depends on: 2706
- ADR: [ADR-0247](../../docs/adr/0247-contextual-relation-filters.md)

## Goal

Audit the complete contextual relation-filter vertical, remove superseded or
duplicate paths, and close the milestone only after release-grade validation.

## Acceptance criteria

- [x] Source, generated declarations, package exports, documentation, examples,
      and tests expose one canonical `field.relation({ where })` contract.
- [x] A removal and dependency audit finds no Drizzle-specific public option,
      transport callback path, serialized resolver, deep import, unsafe `any`,
      mutable Query shortcut, generic bypass, or duplicate execution path.
- [x] Direct reads, inclusions, predicates, cardinality, REST, GraphQL, Yoga,
      PostgreSQL, Access, ACL, Master, cancellation, and application isolation
      satisfy ADR-0247.
- [x] Relation membership mutations, nested writes, pointer behavior, physical
      membership, and established pagination semantics have explicit regression
      coverage and remain unchanged.
- [x] Self-relations, cyclic graphs, maximum depth and complexity, errors,
      callback reuse, multi-application classes, and teardown pass focused
      adversarial tests.
- [x] Every changed handwritten file respects line budgets and centralized
      baselines do not increase.
- [x] `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`, package READMEs, schema
      examples, issue status, ADR index, and the completed plan agree.
- [x] Milestone 27 is marked completed and `CURRENT_PLAN.md` is archived only
      after every completion gate passes.

## Tests

- [x] `yarn constraints`, `yarn check:issues`, `yarn format:check`,
      `git diff --check`, `yarn typecheck`, `yarn test`, `yarn lint`, and
      `yarn build` pass.
- [x] `yarn test:coverage`, `yarn test:pack`, and the complete built PostgreSQL
      E2E suite pass with documented counts and no unexplained skips.
- [x] Every package passes `attw` and `publint` through the repository's release
      validation commands.

## Completion evidence

- The audit found one missing completion gate: relation depth was bounded, but
  the promised operation-wide relation-predicate complexity budget did not yet
  exist. Core now accepts at most 64 caller, declaration, and policy-owned
  predicate occurrences per operation and rejects the 65th before adapter work.
- Focused adversarial tests cover the exact limit, private declaration expansion,
  self-relations, cycles, depth, malformed and asynchronous callbacks,
  cancellation, callback reuse, application isolation, disposal, nested-write
  exclusion, pointer behavior, and physical membership.
- Source, dependency, generated-declaration, and packed-export audits found one
  canonical `field.relation({ where })` contract and no transport callback,
  adapter-specific public option, serialized resolver, deep package import,
  unsafe `any`, mutable Query shortcut, bypass, or duplicate execution path.
- `yarn constraints`, `yarn check:issues`, `yarn format:check`,
  `git diff --check`, `yarn typecheck`, `yarn test`, `yarn lint`, and
  `yarn build` pass. Lint reports only existing centralized line-budget
  warnings; the milestone lowers two baselines and adds none.
- The complete E2E run exposed one cold TypeScript QuickInfo check exceeding its
  generic five-second timeout by 130 milliseconds. That exact archive test now
  has a focused ten-second budget; it passes 68 tests in isolation and in the
  complete matrix without weakening an assertion.
- The ordinary matrix passed 503 files with 2,357 tests. Coverage passed 586
  files with 2,633 tests at 88.84% statements, 81.68% branches, 94.75%
  functions, and 89.38% lines. Packed consumers passed 27 files with 156 tests,
  and the complete built E2E suite passed 86 files with 346 tests. Every package
  passed `attw` and `publint` during both build and archive validation.

## Out of scope

- Expanding v1 after the accepted criteria are complete; additional capabilities
  require new issues and, when architectural, a new ADR.
