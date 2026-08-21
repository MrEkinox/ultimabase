# 1804: Migrate ACL and remove its PostgreSQL bridge

- Status: planned
- Milestone: 18
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/postgres-plugin`, `@ultimabase/roles-plugin`, repository configuration
- Depends on: 1803
- ADR: ADR-0125, ADR-0126, decision from issue 1801

## Goal

Move both ACL constraint families onto portable protected row filters and
delete `@ultimabase/acl-postgres-plugin`, leaving `aclPlugin()` as the only ACL
plugin an application installs.

## Acceptance criteria

- [ ] ACL authorization builds one ordinary `OR` of public, authenticated, exact-principal, and resolved-role containment leaves for every required permission.
- [ ] Core combines ACL's row filter monotonically with developer Query and every other protected policy through logical `AND`.
- [ ] Master bypass, missing identity, role resolution, relationships, mutation targets, and result restrictions retain their current security semantics.
- [ ] Principal and role reference discovery uses portable containment fragments inside the existing private transaction-bound maintenance scope.
- [ ] Cleanup remains singular, lock-aware, rollback-safe, application-local, and preserves unrelated grants.
- [ ] The two public opaque ACL constraint contracts and their superseded implementations receive a complete removal audit.
- [ ] The `packages/acl-postgres-plugin` workspace, exports, manifest fixture, aliases, dependencies, documentation, and active examples are deleted or migrated in the same commit.
- [ ] ADR-0125 is marked superseded without rewriting its history; ADR-0126 and active architecture documentation identify the generic replacement.
- [ ] Planned ACL hardening issues and the paused plan no longer name the deleted package.

## Tests

- [ ] Existing ACL/PostgreSQL authorization, composition, relationship, role-schema, cleanup, event, rollback, and isolation E2E pass with only `aclPlugin()` plus `postgresPlugin()`.
- [ ] Regression tests prove the package and plugin identity are absent from source and packed public manifests.
- [ ] Removing the bridge does not weaken missing-capability or malformed-filter failures.

## Out of scope

- Batching or concurrency hardening retained by issues 432 and 433.
- Renaming `@ultimabase/acl-permissions-plugin` or changing the `aclPlugin()` factory.
- Adding new ACL permissions or changing persisted ACL JSON.
