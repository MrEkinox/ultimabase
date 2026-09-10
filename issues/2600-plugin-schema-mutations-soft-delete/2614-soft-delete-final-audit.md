# 2614: Audit and close plugin-defined mutations and official soft delete

- Status: planned
- Milestone: 26
- Packages: repository-wide
- Depends on: 2613
- ADR: ADR-0245, once accepted

## Goal

Close milestone 26 with complete evidence that the generic kernel remains
product-neutral and the official plugin is secure, optional, and consistent
across every supported execution path.

## Acceptance criteria

- [ ] Generic schema mutation declarations, Runtime execution, Access, Hooks,
      REST, GraphQL, Typegen, and database contracts share one canonical identity
      and no mutable or string-registry bypass remains.
- [ ] Core, REST, GraphQL, Access, Hooks, and adapters contain no soft-delete,
      restore, purge, tombstone, or official-package special case.
- [ ] The soft-delete plugin imports only allowed public foundations, installs no
      policy or lifecycle engine, and requests only truthful conditional
      privileges with exact ownership and diagnostics.
- [ ] Replace and explicit modes preserve their distinct logical Access, Hooks,
      audit, result, relation, transaction, and physical persistence semantics.
- [ ] Protected visibility, tombstone write isolation, Master administration,
      safe transport errors, cancellation, rollback, and multi-application
      isolation remain exact with and without optional official engines.
- [ ] Removal audits find no public include-deleted switch, public restore or
      purge binding, configurable tombstone abstraction, nested soft delete,
      automatic purge, raw adapter escape, deep import, `any`, generated Runtime
      code, or file-budget regression.
- [ ] Public READMEs, architecture, examples, roadmap, ADR links, issue status,
      generated declarations, package exports, and first-release scope describe
      the delivered contract and exclusions accurately.
- [ ] The active plan is archived and milestone 26 is marked completed only
      after every issue and repository validation gate passes.

## Tests

- [ ] Run `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` in safe order.
- [ ] Run complete coverage, package archive, Typegen, Typegen-free JavaScript,
      REST Fetch, networkless GraphQL, Yoga, cross-transport, security,
      performance, concurrency, multi-application, and PostgreSQL E2E suites.

## Out of scope

- Future soft-delete metadata, query modes, cascade rules, retention, jobs,
  uniqueness reuse, bulk administration, OpenAPI, SDKs, or administration UI.
