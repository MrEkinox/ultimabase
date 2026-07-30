# 411: Implement aclPermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 210, 312, 406, 408, 410
- ADR: ADR-0006

## Goal

Compile object access constraints into adapter requests and protect ACL mutation.

## Acceptance criteria

- [ ] Reads, counts, updates, and deletes are filtered before execution.
- [ ] ACL update requires manageAcl.
- [ ] Parent visibility survives inaccessible relations.
- [ ] ACL is visible only with manageAcl.

## Tests

- [ ] Subject, operation, bulk, and relation matrices.
