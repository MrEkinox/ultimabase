# 347: Execute Query terminals through the current context

- Status: done
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

const loadAuthor = (authorId: string) => User.query().byId(authorId).first()
```

Outside a request or hook scope, execution ownership is explicit on the
terminal rather than retained by the builder:

```ts
const posts = await Post.query().find({ ultimabase })
```

## Acceptance criteria

- [x] `Query` exposes every existing read and mutation terminal with unchanged schema, selection, input, cardinality, and result inference.
- [x] Every schema model class exposes one static `query()` entry point equivalent to `new Query(SchemaClass)` without duplicating builder or terminal methods.
- [x] Builder methods remain immutable and retain no application, request, authority, transaction, adapter, or execution option in the Query AST.
- [x] A terminal without explicit ownership uses the exact active Runtime scope.
- [x] Hook terminals reuse the active application, transaction, cancellation signal, recursion state, revocable lease, and nested-operation tracking.
- [x] A terminal outside an active scope accepts `{ ultimabase }` and creates one anonymous internal root request for that exact started application.
- [x] Missing ambient and explicit ownership fails with `MISSING_EXECUTION_CONTEXT`; stopped or cross-application ownership keeps its existing lifecycle error.
- [x] Closed and finalization hook scopes cannot execute terminals or silently fall back to a root request.
- [x] Read terminals take execution options as their only optional argument; mutation terminals take them after the mutation input.
- [x] `BoundQuery`, `Query.bind`, `HookContext.query`, and `UltimaBase.query` are removed from the public API and internal call sites.
- [x] Runtime retains one neutral execution bridge without a process-wide application singleton or a Query-to-adapter dependency.
- [x] Public JSDoc explains ambient resolution, the explicit root fallback, transaction reuse, and the missing-context error with short examples.
- [x] Package documentation presents `Post.query()` as regular DX and `new Query(Post)` as the equivalent lower-level primitive.

## Tests

- [x] Runtime tests cover ambient and explicit execution, nested scope restoration, parallel application isolation, stopped applications, missing context, and cross-application schemas.
- [x] Hook tests cover shared rollback, unawaited nested work, caught nested failures, cancellation, closed leases, and every non-queryable finalization phase.
- [x] Immutability tests prove a reusable Query branch can execute safely in different sequential and concurrent request scopes.
- [x] Compile-time tests preserve exact selections, mutation inputs, singular and collection results, and the final options position.
- [x] Language-service and packed-package tests verify concise terminal hovers, autocomplete, JSDoc, and removal of `BoundQuery` from public exports.
- [x] Existing Runtime-to-PostgreSQL and native-hook E2E coverage runs through direct `Query` terminals.

## Implementation notes

- Query terminals resolve one AsyncLocalStorage execution bridge at call time.
- `UltimaBase` ownership is registered per instance in a `WeakMap`; there is no
  global default application.
- Hook execution narrows the same bridge with its revocable lifetime guard, so
  nested work keeps transaction tracking and rollback-only behavior.

## Out of scope

- Explicit plugin-derived context and master authority overrides, owned by issue 348 after issue 350 removes native user authority.
- Model instance persistence commands, owned by issue 349.
- Query JSON round trips, owned by issue 342.
- Relations, pointers, roles, ACL, or CLP behavior.
- A process-wide default `UltimaBase` instance.
