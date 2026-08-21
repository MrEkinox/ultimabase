# 1905: Replace the RoleSchema extension marker

- Status: completed
- Milestone: 19
- Packages: `@ultimabase/roles-plugin`, `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`, `@ultimabase/core`
- Depends on: 1904
- ADR: decision from issue 1901, ADR-0119

## Goal

Give the Roles plugin an exact application-local way to identify its generated
role schemas without a public or internal schema extension marker.

## Acceptance criteria

- [x] RoleSchema identity uses the canonical owner-attributed mechanism selected by issue 1901 rather than structural matching or a generic metadata bag.
- [x] Multiple developer-defined role domains remain isolated by exact schema and member-schema identity.
- [x] Role hierarchy, subject resolution, reference cleanup, transport visibility, Access, Hooks, Typegen, and PostgreSQL persistence preserve their current behavior.
- [x] Developers cannot forge role ownership by copying a plain option or similarly shaped schema.
- [x] The Roles extension definition, implicit insertion, readers, exports, tests, and documentation are removed in the same change.
- [x] Access and Hooks extension-target helpers receive a final removal audit; helpers without a current non-test consumer are deleted rather than retained speculatively.
- [x] Community plugins retain exact schema, field, field-kind, selector, option, patch, and capability authoring paths without extension-specific APIs.

## Tests

- [x] Runtime, type, Typegen, language-service, packed-package, public E2E, and PostgreSQL tests cover exact RoleSchema identity and isolation.
- [x] Forged, foreign, duplicate, and missing-plugin role declarations fail before infrastructure effects.
- [x] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, and `yarn build` pass.

## Out of scope

- Changing role hierarchy or authorization semantics.
- Adding a new public role-schema configuration namespace without proven need.
