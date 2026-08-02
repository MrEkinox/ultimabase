# 348: Add terminal-only Query authority options

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 319, 347
- ADR: ADR-0013, ADR-0062, ADR-0071, ADR-0090, ADR-0108, ADR-0109

## Goal

Let trusted backend code choose inherited, validated-session, or explicit master
authority at the Query terminal without placing credentials or authority state
in the immutable builder.

## Target developer experience

```ts
const visiblePosts = await Post.query().find({ sessionToken })

const allPosts = await Post.query().find({ useMasterKey: true })

const imported = await Post.query().createMany(rows, {
	ultimabase,
	useMasterKey: true,
})
```

## Acceptance criteria

- [ ] Every Query terminal accepts the same compact authority option union in its final execution-options position.
- [ ] Omitting authority options inherits the active request, or uses anonymous access for an explicitly supplied root application.
- [ ] `{ useMasterKey: true }` is a trusted server-code elevation resolved and audited by the exact application-owned master authority.
- [ ] `{ sessionToken }` delegates validation to an application-owned neutral session resolver and creates user access only after successful validation.
- [ ] `sessionToken` and `useMasterKey: true` are mutually exclusive in TypeScript and at the JavaScript boundary.
- [ ] An authority override inside a hook retains the exact active application, transaction, cancellation, recursion, and lifecycle lease.
- [ ] Master execution continues structural validation, transaction handling, native hooks, and every policy not bypassed by the configured master matrix.
- [ ] Query ASTs, Query JSON, Operation AST inputs, transports, and adapters never retain raw session tokens, master credentials, or terminal execution options.
- [ ] REST, GraphQL, and other transport-normalized inputs cannot map client-provided booleans or fields into trusted terminal authority options.
- [ ] A missing session resolver, invalid session, unavailable master authority, or failed audit produces a stable framework error without executing the operation.
- [ ] Public JSDoc clearly marks these as trusted backend options and shows inherited, session, master, ambient, and explicit-application examples.

## Tests

- [ ] Runtime tests cover inherited anonymous and user access, valid and invalid sessions, master elevation, audit failure, and missing resolver or authority configuration.
- [ ] Transaction tests prove authority changes never detach nested operations from the outer rollback boundary.
- [ ] Security regression tests prove transport payloads cannot forge master or session execution options.
- [ ] Compile-time tests prove the mutually exclusive option union on every singular and collection terminal.
- [ ] Language-service and packed-package tests verify concise options hovers, autocomplete, documentation, and exact results.
- [ ] PostgreSQL E2E tests exercise session and master terminals through the same neutral Runtime pipeline.

## Out of scope

- Implementing a concrete authentication provider or session store.
- Permission-plugin-specific bypass logic inside Runtime.
- Persisting credentials in request metadata, operation nodes, diagnostics, or events.
- Allowing transport query JSON to select trusted backend authority.
