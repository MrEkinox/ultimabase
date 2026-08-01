# 411: Implement aclPermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 210, 328, 331, 337, 406, 408, 410
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

## Tests

- [ ] Subject, operation, bulk, and relation matrices.
