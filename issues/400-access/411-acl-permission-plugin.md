# 411: Implement aclPermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 210, 410, 417, 418, 420
- ADR: ADR-0006, ADR-0090, ADR-0113, ADR-0116

## Goal

Provide object filters, item checks, and ACL-field restrictions through the
native Access lifecycle.

## Acceptance criteria

- [ ] Reads, counts, updates, and deletes are filtered before execution.
- [ ] ACL update requires manageAcl.
- [ ] ACL is visible only with manageAcl.
- [ ] ACL constraints remain separate from hook-transformable queries and cannot be removed by `beforeFind`.
- [ ] ACL registers schema-extension Access contributions that append opaque namespaced row constraints without exposing ACL nodes to Runtime or the developer Query.
- [ ] ACL uses item access for create and ACL mutations that cannot be expressed entirely as row filters.
- [ ] ACL never makes a set-based terminal materialize rows implicitly; unsupported item-level bulk work requires an explicit itemized operation.
- [ ] Master bypass is decided inside the ACL plugin from trusted request authority.
- [ ] ACL has no import, setup dependency, or execution dependency on `clpPermissionPlugin`.
- [ ] ACL imports only neutral role-reference and service-token types and never imports or identifies `rolePermissionPlugin`.
- [ ] A configured role subject requires the neutral role-resolution service and fails application setup before infrastructure starts when no provider is installed.
- [ ] ACL does not resolve or require the role service when no ACL or default ACL references a role.
- [ ] Authenticated and user subjects resolve through optional typed context providers without importing a concrete authentication plugin.

## Tests

- [ ] Subject, operation, bulk, native-Access composition, role-free, missing-provider, and compatible-provider matrices.

## Out of scope

- Pointer and relation traversal, which the relation milestone ending at issue
  747 must route through the same compiled Access plan without existence leakage.
