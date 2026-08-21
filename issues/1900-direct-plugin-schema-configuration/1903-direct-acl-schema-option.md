# 1903: Migrate ACL to a direct schema option

- Status: completed
- Milestone: 19
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 1902
- ADR: ADR-0213, ADR-0214, ADR-0215

## Goal

Replace `extensions: [acl(...)]` and its contextual binder with one direct
plugin-owned `acl` schema option while preserving the complete persisted ACL
security vertical.

## Acceptance criteria

- [x] Schemas configure persisted ACL through the direct `acl` option recognized only when `aclPlugin()` is installed.
- [x] The direct option preserves exact sibling-field typing for default and input-resolution callbacks without `extensions`, `bind`, or a generated Runtime client.
- [x] Presence of the option selects an ordinary owner-attributed field patch through issue 1902, with unchanged logical and PostgreSQL storage semantics.
- [x] Public, authenticated, principal, role, relation, mutation, cleanup, event, rollback, Master, and application-isolation semantics remain fail-closed.
- [x] The `acl()` schema-extension factory, extension types, names, selectors, contextual binding documentation, and superseded exports are removed in the same change.
- [x] ACL uses no private Core imports and remains adapter-neutral.
- [x] Source, Typegen, JavaScript, and Typegen-free authoring expose the same direct option behavior.
- [x] ACL package documentation and examples use only the direct option.

## Tests

- [x] Runtime, type, language-service, packed-package, public E2E, and PostgreSQL Testcontainers tests cover direct authoring and missing-plugin rejection.
- [x] Existing ACL security and persistence suites pass without an ACL schema extension.
- [x] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, and `yarn build` pass.

## Out of scope

- Changing ACL permissions, limits, persisted JSON, or cleanup concurrency.
- Renaming `@ultimabase/acl-permissions-plugin` or `aclPlugin()`.
