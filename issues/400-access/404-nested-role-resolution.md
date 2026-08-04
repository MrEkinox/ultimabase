# 404: Resolve nested roles and reject cycles

- Status: planned
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

- [ ] Only persisted roles from the exact same `RoleSchema` may be passed to `addRole` and `removeRole`.
- [ ] `addRole` remains distinct from `addMember` in names, parameter types, autocomplete, diagnostics, and events.
- [ ] `Administrator.addRole(Editor)` means that direct and inherited members of `Editor` satisfy membership in `Administrator`; the direction is documented consistently.
- [ ] Direct and inherited roles and members are distinguishable.
- [ ] Cycle creation fails before commit.
- [ ] Resolution is deterministic and duplicate-free.
- [ ] Resolution is application-local, request-safe, and does not add a recursive-query primitive to Core.
- [ ] Graph traversal has an explicit bounded failure mode for corrupted or adversarial storage.
- [ ] Direct Query or relation mutations cannot bypass cycle validation, Access, hooks, automatic transactions, rollback, or audit-ready events.

## Tests

- [ ] Type, hover, deep hierarchy, diamond, self-cycle, indirect-cycle, cross-schema, duplicate-path, direct-relation, rollback, and concurrent-application fixtures.
