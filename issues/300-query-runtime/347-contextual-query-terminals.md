# 347: Execute Query terminals through the current context

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 333, 339, 340, 343
- ADR: ADR-0058, ADR-0066, ADR-0094, ADR-0107, ADR-0108, ADR-0109

## Goal

Make the immutable `Query` class directly executable by resolving each terminal
against the current Runtime scope or an explicitly supplied `UltimaBase`
instance, removing context plumbing and the duplicated public `BoundQuery`
builder surface.

## Target developer experience

```ts
const Post = Schema.define({
	className: 'Post',
	fields: {},
	hooks: {
		beforeCreate: async ({ input }) => {
			const author = await loadAuthor(input.authorId)

			return input
		},
	},
})

const loadAuthor = (authorId: string) =>
	User.query().byId(authorId).findOne()
```

Outside a request or hook scope, execution ownership is explicit on the
terminal rather than retained by the builder:

```ts
const posts = await Post.query().find({ ultimabase })
```

## Acceptance criteria

- [ ] `Query` exposes every existing read and mutation terminal with unchanged schema, selection, input, cardinality, and result inference.
- [ ] Every schema model class exposes one static `query()` entry point equivalent to `new Query(SchemaClass)` without duplicating builder or terminal methods.
- [ ] Builder methods remain immutable and retain no application, request, authority, transaction, adapter, or execution option in the Query AST.
- [ ] A terminal without explicit ownership uses the exact active Runtime scope.
- [ ] Hook terminals reuse the active application, transaction, cancellation signal, recursion state, revocable lease, and nested-operation tracking.
- [ ] A terminal outside an active scope accepts `{ ultimabase }` and creates one anonymous internal root request for that exact started application.
- [ ] Missing ambient and explicit ownership fails with `MISSING_EXECUTION_CONTEXT`; stopped or cross-application ownership keeps its existing lifecycle error.
- [ ] Closed and finalization hook scopes cannot execute terminals or silently fall back to a root request.
- [ ] Read terminals take execution options as their only optional argument; mutation terminals take them after the mutation input.
- [ ] `BoundQuery`, `Query.bind`, `HookContext.query`, and `UltimaBase.query` are removed from the public API and internal call sites.
- [ ] Runtime retains one neutral execution bridge without a process-wide application singleton or a Query-to-adapter dependency.
- [ ] Public JSDoc explains ambient resolution, the explicit root fallback, transaction reuse, and the missing-context error with short examples.
- [ ] Package documentation presents `Post.query()` as regular DX and `new Query(Post)` as the equivalent lower-level primitive.

## Tests

- [ ] Runtime tests cover ambient and explicit execution, nested scope restoration, parallel application isolation, stopped applications, missing context, and cross-application schemas.
- [ ] Hook tests cover shared rollback, unawaited nested work, caught nested failures, cancellation, closed leases, and every non-queryable finalization phase.
- [ ] Immutability tests prove a reusable Query branch can execute safely in different sequential and concurrent request scopes.
- [ ] Compile-time tests preserve exact selections, mutation inputs, singular and collection results, and the final options position.
- [ ] Language-service and packed-package tests verify concise terminal hovers, autocomplete, JSDoc, and removal of `BoundQuery` from public exports.
- [ ] Existing Runtime-to-PostgreSQL and native-hook E2E coverage runs through direct `Query` terminals.

## Out of scope

- Session-token and master authority overrides, owned by issue 348.
- Model instance persistence commands, owned by issue 349.
- Query JSON round trips, owned by issue 342.
- Relations, pointers, roles, ACL, or CLP behavior.
- A process-wide default `UltimaBase` instance.
