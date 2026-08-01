# 411: Implement aclPermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 210, 312, 330, 331, 406, 408, 410
- ADR: ADR-0006, ADR-0089

## Goal

Compile object access constraints into adapter requests and protect ACL mutation.

## Acceptance criteria

- [ ] Reads, counts, updates, and deletes are filtered before execution.
- [ ] ACL update requires manageAcl.
- [ ] Parent visibility survives inaccessible relations.
- [ ] ACL is visible only with manageAcl.
- [ ] ACL constraints remain separate from hook-transformable queries and cannot be removed by `beforeFind`.

## Tests

- [ ] Subject, operation, bulk, and relation matrices.
