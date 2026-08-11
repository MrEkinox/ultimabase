# 1506: Adapt ACL, roles, and PostgreSQL policy integrations

- Status: planned
- Milestone: 15
- Packages: `@ultimabase/access-contracts`, `@ultimabase/access-plugin`, `@ultimabase/acl-permissions-plugin`, `@ultimabase/acl-postgres-plugin`, `@ultimabase/roles-plugin`, `@ultimabase/postgres-plugin`, `@ultimabase/plugin-kit`
- Depends on: 1505
- ADR: ADR-0117, ADR-0122, ADR-0125, ADR-0189, ADR-0194

## Goal

Move existing official Access providers and adapter compilers onto the public
versioned Access capability without changing their accepted behavior.

## Acceptance criteria

- [ ] ACL contributes schema metadata, input resolution, field restrictions, item decisions, row constraints, and output restrictions through the public Access provider contract.
- [ ] ACL PostgreSQL compiles opaque versioned constraints through public adapter capabilities and never imports Access or Core internals.
- [ ] Roles and current-principal providers expose neutral context capabilities without granting authority or depending on concrete consumers.
- [ ] Provider requirements resolve by compatible capability and version where a package-specific dependency is unnecessary.
- [ ] ACL and neutral providers depend on access-contracts rather than importing access-plugin implementation or relying on its configured plugin name.
- [ ] ACL public, principal, role, master, reference cleanup, entry limit, event, and application-isolation behavior remains unchanged.
- [ ] Applicable repeated authoring code migrates to plugin-kit; official plugins pass the public conformance harness.
- [ ] Paused ACL hardening issues 432 through 435 remain paused and are not silently implemented or discarded.

## Tests

- [ ] Existing ACL, Roles, Access composition, packed, Typegen, PostgreSQL, event, cleanup, and provider-order suites pass through public contracts.
- [ ] Dependency checks prohibit deep and private imports in every migrated package.

## Out of scope

- Resuming ACL cleanup hardening issues 432 through 435.
- Adding authentication product behavior.
