# 403: Add typed role member commands

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 317, 349, 402, 743
- ADR: ADR-0099, ADR-0113, ADR-0115, ADR-0118, ADR-0119

## Goal

Add explicit `addMember` and `removeMember` commands to persisted role models,
using the generated member relation and the same Runtime lifecycle as every
ordinary relation mutation.

## Target developer experience

```ts
const Editor = await new AppRole({ name: 'editor' }).create({
	useMasterKey: true,
})

await Editor.addMember(UserSchema.pointer(user.id), {
	useMasterKey: true,
})

await Editor.removeMember(UserSchema.pointer(user.id), {
	useMasterKey: true,
})
```

## Acceptance criteria

- [ ] Only persisted role instances expose executable member commands; an immutable draft cannot be mistaken for a stored role after `create()`.
- [ ] `addMember` and `removeMember` accept only a persisted instance or Pointer of the exact member schema declared by the originating `RoleSchema`.
- [ ] A RoleSchema from another member domain, an unrelated schema model, a raw identifier, and a draft member fail precise compile-time or runtime validation as appropriate.
- [ ] Commands resolve the active request context or accept ordinary terminal execution options without retaining an application, adapter, credential, or mutable relation state.
- [ ] Commands delegate to the generated relation handle and therefore preserve schema and field Access, hooks, automatic transactions, target preflight, cancellation, recursion protection, and rollback.
- [ ] Duplicate addition is idempotent and removing an absent membership has one documented deterministic result.
- [ ] Direct advanced relation mutation through a queried `AppRole` remains possible and passes the same plugin invariants; commands are concise aliases rather than a bypass pipeline.
- [ ] Membership changes emit typed audit-ready post-commit events and emit nothing after rollback.

## Tests

- [ ] Runtime, type, language-service, duplicate, missing, authority, Access, hook, nested-transaction, rollback, event, public-export, and cross-role-domain tests.

## Out of scope

- Adding one role to another.
- Resolving the current request member or evaluating `hasRole()`.
