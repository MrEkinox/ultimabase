# 411: Implement aclPermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 210, 328, 331, 337, 406, 410
- ADR: ADR-0006, ADR-0089, ADR-0090

## Goal

Compile object access constraints into adapter requests and protect ACL mutation.

## Acceptance criteria

- [ ] Reads, counts, updates, and deletes are filtered before execution.
- [ ] ACL update requires manageAcl.
- [ ] Parent visibility survives inaccessible relations.
- [ ] ACL is visible only with manageAcl.
- [ ] ACL constraints remain separate from hook-transformable queries and cannot be removed by `beforeFind`.
- [ ] ACL installs schema-extension hooks that append opaque namespaced constraints without exposing ACL nodes to Runtime.
- [ ] Master bypass is decided inside the ACL plugin from trusted request authority.
- [ ] ACL has no import, setup dependency, or execution dependency on `clpPermissionPlugin`.
- [ ] ACL imports only neutral role-reference and service-token types and never imports or identifies `rolePermissionPlugin`.
- [ ] A configured role subject requires the neutral role-resolution service and fails application setup before infrastructure starts when no provider is installed.
- [ ] ACL does not resolve or require the role service when no ACL or default ACL references a role.

## Tests

- [ ] Subject, operation, bulk, and relation matrices plus role-free, missing-provider, and compatible-provider setup fixtures.
