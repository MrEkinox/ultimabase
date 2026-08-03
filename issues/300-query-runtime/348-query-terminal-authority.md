# 348: Add terminal-only Query authority options

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 319, 347, 350
- ADR: ADR-0071, ADR-0090, ADR-0108, ADR-0109, ADR-0113

## Goal

Let trusted backend code choose an inherited or explicit plugin-derived context,
or audited master authority, at the Query terminal without placing execution
state in the immutable builder.

## Target developer experience

```ts
const visiblePosts = await auth.runWithSession(sessionToken, () =>
	Post.query().find(),
)

const allPosts = await Post.query().find({ useMasterKey: true })

const imported = await Post.query().createMany(rows, {
	ultimabase,
	useMasterKey: true,
})

const scopedPosts = await Post.query().find({
	context: contextCreatedByAPlugin,
	ultimabase,
})
```

## Acceptance criteria

- [ ] Every Query terminal accepts the same compact authority option union in its final execution-options position.
- [ ] Omitting authority options inherits the active request, or uses anonymous access for an explicitly supplied root application.
- [ ] `{ useMasterKey: true }` is a trusted server-code elevation resolved and audited by the exact application-owned master authority.
- [ ] An explicit `context` accepts an already-derived immutable context and never validates credentials or manufactures plugin-owned values.
- [ ] An explicit context outside an ambient scope requires the exact `ultimabase`; inside a scope it cannot switch applications.
- [ ] `context` and `useMasterKey: true` compose only by elevating that context through the exact application-owned master authority.
- [ ] An authority override inside a hook retains the exact active application, transaction, cancellation, recursion, and lifecycle lease.
- [ ] Master execution continues structural validation, transaction handling, native hooks, and every policy not bypassed by the configured master matrix.
- [ ] Query ASTs, Query JSON, Operation AST inputs, transports, and adapters never retain contexts, plugin values, master credentials, or terminal execution options.
- [ ] REST, GraphQL, and other transport-normalized inputs cannot map client-provided booleans or fields into trusted terminal authority options.
- [ ] A cross-application context, unavailable master authority, or failed audit produces a stable framework error without executing the operation.
- [ ] Public JSDoc clearly marks these as trusted backend options and shows inherited, explicit-context, master, ambient, and explicit-application examples.

## Tests

- [ ] Runtime tests cover inherited anonymous access, explicit plugin-derived contexts, master elevation, audit failure, and missing authority configuration.
- [ ] Transaction tests prove authority changes never detach nested operations from the outer rollback boundary.
- [ ] Security regression tests prove transport payloads cannot forge master or explicit-context execution options.
- [ ] Compile-time tests prove the mutually exclusive option union on every singular and collection terminal.
- [ ] Language-service and packed-package tests verify concise options hovers, autocomplete, documentation, and exact results.
- [ ] PostgreSQL E2E tests exercise plugin-derived context and master terminals through the same neutral Runtime pipeline.

## Out of scope

- Accepting or validating session tokens, user identifiers, or provider credentials.
- Implementing a concrete authentication provider, user schema, or session store.
- Permission-plugin-specific bypass logic inside Runtime.
- Persisting credentials in request metadata, operation nodes, diagnostics, or events.
- Allowing transport query JSON to select trusted backend authority.
