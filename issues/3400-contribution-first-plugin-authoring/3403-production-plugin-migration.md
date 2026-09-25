# 3403: Migrate every production plugin

- Status: completed
- Milestone: 34
- Depends on: 3402
- ADR: ADR-0270

## Goal

Move every official and repository-owned production plugin to the proven
contribution-first form without changing product behavior.

## Acceptance criteria

- [x] Every production plugin uses `plugin()` and one contributions list.
- [x] No production plugin spells internal declaration/setup/hook buckets.
- [x] Options, identities, instances, relationships, claims, exports, and
      privilege diagnostics remain equivalent.
- [x] Package-focused tests pass for every migrated plugin.

## Handoff

- Documentation impact: internal engineering documentation. ADR-0270 and this
  issue now record the repository-wide production migration; package READMEs
  and public website pages remain accurate because plugin consumer options,
  exports, behavior, and installation did not change in this issue.
- Migrated every remaining official production plugin to `plugin()`,
  `contributeDeclarations()`, and, where needed, one
  `contributeApplication()` resource. The production plugin implementations
  remove 259 net lines while retaining all existing conformance expectations.
- Core now keeps a capability tuple exact when no operation contribution is
  present and normalizes an application resource with `exports: undefined` to
  the historical `void` setup-export type.
- Package tests passed for Access (35), ACL (80), Apollo Sandbox (14), GraphiQL
  (14), GraphQL (106), GraphQL Yoga (37), Hooks (83), HTTP (95), pg-vector
  (33), PostgreSQL (169), REST (103), Roles (43), server-hono (34), and
  Validation (41). GraphQL Yoga and server-hono browser suites were rerun
  outside the filesystem sandbox because they bind loopback ports.
- Core passed 263 files, 1,337 tests, and type tests; its package build,
  API-surface validation, and focused ESLint checks passed (with only existing
  file-size warnings below the hard budget).
