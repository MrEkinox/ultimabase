# 403: Add typed role member commands

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/roles-plugin`
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

- [x] Only persisted role instances expose executable member commands; an immutable draft cannot be mistaken for a stored role after `create()`.
- [x] `addMember` and `removeMember` accept only a persisted instance or Pointer of the exact member schema declared by the originating `RoleSchema`.
- [x] A RoleSchema from another member domain, an unrelated schema model, a raw identifier, and a draft member fail precise compile-time or runtime validation as appropriate.
- [x] Commands resolve the active request context or accept ordinary terminal execution options without retaining an application, adapter, credential, or mutable relation state.
- [x] Commands delegate to the generated relation handle and therefore preserve schema and field Access, hooks, automatic transactions, target preflight, cancellation, recursion protection, and rollback.
- [x] Duplicate addition is idempotent and removing an absent membership succeeds without changing stored edges, matching relation semantics.
- [x] Direct advanced relation mutation through a queried `AppRole` remains possible and passes the same plugin invariants; commands are concise aliases rather than a bypass pipeline.
- [x] Membership changes emit typed audit-ready post-commit events and emit nothing after rollback.

## Tests

- [x] Core specialization runtime tests plus role type, language-service, event-contract, public-export, and cross-domain boundaries cover the command surface. Live duplicate, authority, Access, hook, nested-transaction, rollback, and delivery behavior remains in issue 423's PostgreSQL vertical.

## Out of scope

- Adding one role to another.
- Resolving the current request member or evaluating `hasRole()`.
