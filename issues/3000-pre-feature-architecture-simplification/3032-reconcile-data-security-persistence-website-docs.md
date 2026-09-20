# 3032: Reconcile the data, security, and persistence website journey

- Status: planned
- Milestone: 30
- Packages: `apps/website`, Access, Hooks, Validation, Roles, ACL Permissions, Password Auth, Soft Delete, PostgreSQL, and PostgreSQL Vector plugins
- Depends on: 3031
- ADR: retained plugin decisions and any explicitly approved public changes from issues 3015 through 3023

## Goal

Make the public Fumadocs journey through persistence, lifecycle, validation,
identity, authorization, and optional data behavior match the simplified
plugins and their exact ownership boundaries.

## Acceptance criteria

- [ ] Audit the `postgresql`, `optional-data-behavior`,
      `validation-and-lifecycle`, and `authentication-and-authorization`
      ownership areas plus every affected page-level `sources` entry.
- [ ] Verify installation, schema options, ordering, security defaults, Master,
      sessions, policy composition, transactions, examples, REST and GraphQL
      usage, limitations, and troubleshooting against final source behavior.
- [ ] Explain plugin independence clearly: Access and ACL, identity and
      authorization, Hooks and validation, Soft Delete and transports, and
      PostgreSQL and logical Core behavior must not blur ownership.
- [ ] Remove stale APIs and duplicated explanations, preserve runnable examples,
      and add migration notes for every explicitly approved public change.
- [ ] Verify navigation, cross-links, page `sources`, code samples,
      accessibility, responsive layout, and light and dark themes.

## Tests

- [ ] Website formatting, typecheck, content validation, build, link/source
      checks, and focused browser checks pass.

## Audit gate

- [ ] Read the complete journey as an application developer and audit every
      claim against final source, packed exports, and public transport behavior.
      Correct and repeat until no stale or missing step remains.
- [ ] Record reviewed pages and Documentation impact: public website
      documentation.

## Out of scope

- Adding the paused ACL or Soft Delete features.
