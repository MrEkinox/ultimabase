# 2707: Audit and close contextual relation filters

- Status: planned
- Milestone: 27
- Packages: repository-wide
- Depends on: 2706
- ADR: [ADR-0247](../../docs/adr/0247-contextual-relation-filters.md)

## Goal

Audit the complete contextual relation-filter vertical, remove superseded or
duplicate paths, and close the milestone only after release-grade validation.

## Acceptance criteria

- [ ] Source, generated declarations, package exports, documentation, examples,
      and tests expose one canonical `field.relation({ where })` contract.
- [ ] A removal and dependency audit finds no Drizzle-specific public option,
      transport callback path, serialized resolver, deep import, unsafe `any`,
      mutable Query shortcut, generic bypass, or duplicate execution path.
- [ ] Direct reads, inclusions, predicates, cardinality, REST, GraphQL, Yoga,
      PostgreSQL, Access, ACL, Master, cancellation, and application isolation
      satisfy ADR-0247.
- [ ] Relation membership mutations, nested writes, pointer behavior, physical
      membership, and established pagination semantics have explicit regression
      coverage and remain unchanged.
- [ ] Self-relations, cyclic graphs, maximum depth and complexity, errors,
      callback reuse, multi-application classes, and teardown pass focused
      adversarial tests.
- [ ] Every changed handwritten file respects line budgets and centralized
      baselines do not increase.
- [ ] `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`, package READMEs, schema
      examples, issue status, ADR index, and the completed plan agree.
- [ ] Milestone 27 is marked completed and `CURRENT_PLAN.md` is archived only
      after every completion gate passes.

## Tests

- [ ] `yarn constraints`, `yarn check:issues`, `yarn format:check`,
      `git diff --check`, `yarn typecheck`, `yarn test`, `yarn lint`, and
      `yarn build` pass.
- [ ] `yarn test:coverage`, `yarn test:pack`, and the complete built PostgreSQL
      E2E suite pass with documented counts and no unexplained skips.
- [ ] Every package passes `attw` and `publint` through the repository's release
      validation commands.

## Out of scope

- Expanding v1 after the accepted criteria are complete; additional capabilities
  require new issues and, when architectural, a new ADR.
