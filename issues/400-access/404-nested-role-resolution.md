# 404: Resolve nested roles and reject cycles

- Status: complete
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 403
- ADR: ADR-0006

## Goal

Add explicit nested-role model commands, resolve transitive membership, and
reject cycles through the generated self relation without coupling the graph
to one database adapter.

## Target developer experience

```ts
await Administrator.addRole(Editor, { useMasterKey: true })
await Administrator.removeRole(Editor, { useMasterKey: true })
```

Every direct member of `Editor` then satisfies membership in `Administrator`.

## Acceptance criteria

- [x] Only persisted roles from the exact same `RoleSchema` may be passed to `addRole` and `removeRole`.
- [x] `addRole` remains distinct from `addMember` in names, parameter types, autocomplete, diagnostics, and events.
- [x] `Administrator.addRole(Editor)` means that direct and inherited members of `Editor` satisfy membership in `Administrator`; the direction is documented consistently.
- [x] Direct and inherited child roles are distinguishable in the reusable hierarchy snapshot; member classification consumes that snapshot in issue 406.
- [x] Cycle creation fails before commit.
- [x] Resolution is deterministic and duplicate-free.
- [x] Resolution is application-local, request-safe, and does not add a recursive-query primitive to Core.
- [x] Graph traversal has explicit depth and visited-role bounds for corrupted or adversarial storage.
- [x] Direct Query or relation mutations cannot bypass cycle validation, Access, hooks, automatic transactions, rollback, or audit-ready events.

## Tests

- [x] Type, hover, deep hierarchy, diamond, self-cycle, indirect-cycle, cross-schema, duplicate-path, bounds, and application-isolation fixtures cover the portable layer. Direct PostgreSQL relation, rollback, and concurrency behavior remains in issue 423.
