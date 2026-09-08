# ADR-0113: Plugin-owned authentication context

- Status: accepted
- Date: 2026-08-03
- Supersedes: ADR-0013, ADR-0062
- Refines: ADR-0065, ADR-0090, ADR-0102, ADR-0107, ADR-0108
- Refined by: ADR-0114, ADR-0224, ADR-0242

## Context

Core currently defines `anonymous`, `user`, and `master` request modes. It can
construct a user context from a stable identifier even when the application has
no authentication plugin, user schema, session validator, or credential
provider.

That makes one optional product capability part of the foundational Runtime
contract. It also gives Query terminals a reason to understand session tokens,
although credentials and the schema that represents an authenticated principal
must belong to the installed authentication plugin.

UltimaBase must remain fully usable for applications that have no users. A
future authentication plugin must be able to add its own user schema, session
behavior, transport integration, and typed identity without changing Runtime or
the Query AST.

## Decision

### Core authority has two modes

Core recognizes only `anonymous` and `master` authority. `anonymous` is the
ordinary non-master execution boundary; it does not assert that no plugin has
attached an authenticated identity. `master` remains an audited authority that
only trusted backend code can obtain through the application-owned master
service.

There is no native `user` or `system` authority mode. Core exports no user
identifier contract and does not create user request contexts. Applications
without authentication use the complete schema, Query, hook, transaction, and
plugin system through anonymous or master execution.

Master authority remains orthogonal to identity. Elevating one request retains
its safe plugin-owned context values for correlation and auditing, but only the
authority mode changes. Each policy plugin continues to decide whether master
bypasses that policy.

### Plugins own typed request values

Core provides nominal typed request-value tokens and immutable context
derivation. A token is compared by object identity, carries the exact value type
for TypeScript, and cannot be reconstructed from transport data with a matching
string. Context values remain separate from untyped diagnostic metadata and
from boolean request capabilities.

A plugin may validate external input and derive a context containing values
owned by its tokens. Derivation preserves the request ID, source, cancellation
signal, application scope, transaction lifetime, hook lease, and existing
values. It cannot elevate authority, replace another token's value silently, or
introduce a raw master credential.

Authentication plugins use this mechanism for their principal and session
state. Role, CLP, ACL, and field-permission plugins consume only neutral typed
tokens or services required by their configured rules. They never import or
identify a concrete authentication plugin. Missing required identity data fails
closed when a configured policy needs it; its absence is otherwise valid.

### Authentication is an optional plugin capability

An authentication plugin owns:

- its user schema or an explicitly configured compatible schema;
- credential validation, sessions, and provider-specific storage;
- `signUp`, `login`, `logout`, refresh, and similar custom operations;
- typed request-value tokens for authenticated identity;
- transport hooks that derive an authenticated context after successful
  validation;
- helpers that run trusted backend callbacks in a validated session context.

Installing no authentication plugin registers none of these schemas, services,
operations, hooks, or context values.

### Query terminals stay credential-neutral

Query execution options accept an inherited ambient context, an explicit
already-derived context with its exact application, or `useMasterKey: true`.
They never accept session tokens, provider credentials, user identifiers, or an
authentication callback.

The compact server-side forms are:

```ts
await PostSchema.query().find()

await PostSchema.query().find({ useMasterKey: true })

await PostSchema.query().find({
	context: contextCreatedByAPlugin,
	ultimabase,
})
```

An authentication plugin may provide a higher-level helper:

```ts
await auth.runWithSession(sessionToken, () => PostSchema.query().find())
```

The plugin validates the credential before entering the execution scope. The
Query, Operation AST, Runtime pipeline, adapter request, diagnostics, and event
payloads never retain that credential.

### Transport integration is compositional

A transport starts from an anonymous context. Installed plugins may contribute
ordered context resolvers that validate their own transport credentials and
derive additional typed values before the operation runs. A transport cannot
manufacture master authority or map client input to `useMasterKey`.

## Consequences

- Issue 350 removes native user access and adds the typed request-value
  derivation boundary before terminal authority work continues.
- Issue 348 no longer implements session resolution; it owns only inherited or
  explicit context execution and trusted master elevation.
- Authentication packages can evolve independently without adding provider or
  user-schema concepts to Core.
- Permission plugins can represent authenticated, user, owner, and role
  subjects in their own domain while resolving them from optional typed context
  providers.
- Existing user-mode APIs remain temporarily implemented until issue 350 lands;
  this ADR records their planned removal rather than documenting them as the
  final public contract.
