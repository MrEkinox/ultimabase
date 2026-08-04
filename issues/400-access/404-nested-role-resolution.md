# 404: Resolve nested roles and reject cycles

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 403
- ADR: ADR-0006

## Goal

Allow a role to include another role, resolve transitive membership, and reject
cycles without coupling the graph to one database adapter.

## Target developer experience

```ts
await roles.addMember(Administrator, Editor, { useMasterKey: true })
```

Every direct member of `Editor` then satisfies membership in `Administrator`.

## Acceptance criteria

- [ ] Direct and inherited roles are distinguishable.
- [ ] Role inclusion uses the same immutable membership API as external subjects.
- [ ] Cycle creation fails before commit.
- [ ] Resolution is deterministic and duplicate-free.
- [ ] Resolution is application-local, request-safe, and does not add a recursive-query primitive to Core.
- [ ] Graph traversal has an explicit bounded failure mode for corrupted or adversarial storage.

## Tests

- [ ] Deep hierarchy, diamond, self-cycle, indirect-cycle, duplicate-path, rollback, and concurrent-application fixtures.
