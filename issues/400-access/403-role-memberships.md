# 403: Implement direct role memberships

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 317, 402
- ADR: ADR-0006, ADR-0113, ADR-0116

## Goal

Add stable plugin-owned subject references as direct role members through
transaction-safe relation services without requiring a Core user mode or an
authentication package.

## Target developer experience

```ts
const roles = ultimabase.getService(roleServiceToken)
const principal = new AccessSubjectReference('auth.user', userId)

await roles.addMember(Editor, principal, { useMasterKey: true })
await roles.removeMember(Editor, principal, { useMasterKey: true })
```

## Acceptance criteria

- [ ] One membership accepts a nominal subject reference owned by any installed identity provider; the roles package never imports that provider.
- [ ] Subject kind and stable value are persisted without assuming a foreign key to a User schema.
- [ ] Add and remove execute through Query, RequestEngine, native Access, hooks, and one automatic transaction.
- [ ] Duplicate addition is idempotent and removing an absent membership has one documented deterministic result.
- [ ] Role administration requires audited master authority by default without retaining or exposing a raw credential.
- [ ] Membership changes emit typed audit-ready post-commit events and emit nothing after rollback.

## Tests

- [ ] Add, remove, duplicate, missing, application-isolation, authority, event, and rollback tests.
