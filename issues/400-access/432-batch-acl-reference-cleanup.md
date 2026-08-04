# 432: Batch ACL reference cleanup with stable cursors

- Status: ready
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/core`, `@ultimabase/acl-postgres-plugin`
- Depends on: 426, 427
- ADR: ADR-0126

## Goal

Keep transactional, hook-aware singular cleanup while avoiding one unbounded
in-memory list of every matching ACL row.

## Acceptance criteria

- [ ] Reference discovery uses deterministic ID ordering and bounded cursor batches.
- [ ] No cleanup branch materializes every matching ID before the first update.
- [ ] Each row is still locked and rewritten through one ordinary singular update in the subject deletion transaction.
- [ ] Unrelated grants and changes observed after the row lock remain preserved.
- [ ] Multiple ACL-enabled schemas are processed deterministically without adding a public batching option to `aclPlugin()`.
- [ ] A failure in any batch rolls back earlier batches and the subject deletion.
- [ ] `fail` and `preserve` policies retain their existing semantics.

## Tests

- [ ] PostgreSQL fixtures exceed the internal batch size and prove complete principal and role cleanup.
- [ ] Multi-schema rollback and application-isolation regressions remain green.
