# 2614: Audit and close plugin-defined mutations and official soft delete

- Status: completed
- Milestone: 26
- Packages: repository-wide
- Depends on: 2613
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Close milestone 26 with complete evidence that the generic kernel remains
product-neutral and the official plugin is secure, optional, and consistent
across every supported execution path.

## Acceptance criteria

- [x] Generic schema mutation declarations, Runtime execution, Access, Hooks,
      REST, GraphQL, Typegen, and database contracts share one canonical identity
      and no mutable or string-registry bypass remains.
- [x] Core, REST, GraphQL, Access, Hooks, and adapters contain no soft-delete,
      restore, purge, tombstone, or official-package special case.
- [x] The soft-delete plugin imports only allowed public foundations, installs no
      policy or lifecycle engine, and requests only truthful conditional
      privileges with exact ownership and diagnostics.
- [x] Replace and explicit modes preserve their distinct logical Access, Hooks,
      audit, result, relation, transaction, and physical persistence semantics.
- [x] Protected visibility, tombstone write isolation, Master administration,
      safe transport errors, cancellation, rollback, and multi-application
      isolation remain exact with and without optional official engines.
- [x] Removal audits find no public include-deleted switch, public restore or
      purge binding, configurable tombstone abstraction, nested soft delete,
      automatic purge, raw adapter escape, deep import, `any`, generated Runtime
      code, or file-budget regression.
- [x] Public READMEs, architecture, examples, roadmap, ADR links, issue status,
      generated declarations, package exports, and first-release scope describe
      the delivered contract and exclusions accurately.
- [x] The active plan is archived and milestone 26 is marked completed only
      after every issue and repository validation gate passes.

## Tests

- [x] Run `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` in safe order.
- [x] Run complete coverage, package archive, Typegen, Typegen-free JavaScript,
      REST Fetch, networkless GraphQL, Yoga, cross-transport, security,
      performance, concurrency, multi-application, and PostgreSQL E2E suites.

## Completion evidence

- Static source and dependency audits found no product-specific branch in Core,
  REST, GraphQL, Access, Hooks, or PostgreSQL. The PostgreSQL persistence-plan
  comment now describes only its generic physical-rewrite invariant. The
  soft-delete package imports only Core, Plugin Kit, and Shared public roots and
  contains no deep import, raw-adapter privilege, authority elevation, Runtime
  replacement, environment claim, public administration binding, or forbidden
  v1 extension.
- The official manifest inventory now records the payload-free command's
  truthful `typegen:reference` privilege. Source, generated declarations,
  Typegen-free JavaScript, packed consumers, and application-local Typegen agree
  on the same canonical mutation identities and exact schema/model surfaces.
- Direct TypeScript, replace and explicit modes, itemized native deletes,
  protected visibility, Access, Hooks, Master restore and purge, cancellation,
  rollback, relations, REST Fetch, networkless GraphQL, Yoga, application
  isolation, and PostgreSQL all pass through the shared logical Runtime path.
- `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
  `yarn lint`, `yarn format:check`, and `yarn build` pass. The final matrices
  include 494 files with 2,324 ordinary tests, 575 files with 2,595 coverage
  tests, 27 packed-package files with 155 tests, and 84 built E2E files with 341
  tests. Every package passes `attw` and `publint`.
- Coverage finishes at 88.77% statements, 81.56% branches, 94.66% functions,
  and 89.32% lines. Lint has no errors and reports only the centralized existing
  line-budget warnings; this issue adds no exception or hard-limit regression.

## Out of scope

- Future soft-delete metadata, query modes, cascade rules, retention, jobs,
  uniqueness reuse, bulk administration, OpenAPI, SDKs, or administration UI.
