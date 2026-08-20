# 1506: Adapt ACL, roles, and PostgreSQL policy integrations

- Status: merged into 1504
- Milestone: 15
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/acl-postgres-plugin`, `@ultimabase/roles-plugin`, `@ultimabase/postgres-plugin`, `@ultimabase/plugin-kit`, `@ultimabase/core`
- Depends on: 1504
- ADR: ADR-0117, ADR-0122, ADR-0125, ADR-0189, ADR-0194, ADR-0203, ADR-0204, ADR-0205

ADR-0205 makes ACL an independent consumer of Core's generic protected policy
capability and requires its migration to land atomically with Access extraction.
This issue's acceptance criteria move into issue 1504; it is not a separate
implementation or commit.

## Goal

Move ACL and its adapter compilers onto Core's public generic protected policy
capability, and keep Roles and request-subject providers neutral, without
changing their accepted behavior.

## Acceptance criteria

- [ ] ACL contributes schema metadata, input resolution, field restrictions, item decisions, row constraints, and output restrictions through Core's public generic protected policy contract.
- [ ] ACL PostgreSQL compiles opaque versioned constraints through public adapter capabilities and never imports Access or Core internals.
- [ ] Roles and current-principal providers expose neutral context capabilities without granting authority or depending on concrete consumers.
- [ ] Provider requirements resolve by compatible capability and version where a package-specific dependency is unnecessary.
- [ ] ACL, ACL PostgreSQL, Roles, and neutral subject providers do not import, depend on, or peer with access-plugin.
- [ ] ACL public, principal, role, master, reference cleanup, entry limit, event, and application-isolation behavior remains unchanged.
- [ ] Applicable repeated authoring code migrates to plugin-kit; official plugins pass the public conformance harness.
- [ ] Paused ACL hardening issues 432 through 435 remain paused and are not silently implemented or discarded.

## Tests

- [ ] Existing ACL, Roles, Access composition, packed, Typegen, PostgreSQL, event, cleanup, and provider-order suites pass through public contracts.
- [ ] Dependency checks prohibit deep and private imports in every migrated package.

## Out of scope

- Resuming ACL cleanup hardening issues 432 through 435.
- Adding authentication product behavior.
