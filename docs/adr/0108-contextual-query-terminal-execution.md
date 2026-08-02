# ADR-0108: Contextual Query terminal execution

- Status: accepted
- Date: 2026-08-03
- Refines: ADR-0058, ADR-0065, ADR-0066, ADR-0067, ADR-0069, ADR-0071, ADR-0074, ADR-0094, ADR-0107
- Supersedes: ADR-0061, ADR-0092
- Refined by: ADR-0109

## Context

`Query` currently owns the immutable transport-neutral builder while
`BoundQuery` duplicates that builder surface to add executable terminals.
Application code obtains the bound form through `ultimabase.query(schema)`, and
hook helpers must repeatedly forward `HookContext` merely to call
`context.query(schema)`. That explicit capability is safe, but it adds plumbing
to ordinary backend helpers and makes one fundamental domain object appear as
two public classes.

UltimaBase targets Node.js backend applications. Developer-authored server code
is trusted to choose whether one terminal inherits the active request, executes
for a validated session, or explicitly uses master authority. Transport input
is not trusted server code and must never acquire those execution options by
deserializing a query or operation payload.

## Decision

### One immutable Query class

`new Query(schema)` remains an immutable, reusable Query AST builder. Builder
methods never accept or retain an application, request, authority, transaction,
or adapter. The public `BoundQuery` class is removed; executable terminals live
directly on `Query` without changing the transport-neutral AST.

Every terminal resolves its execution environment only when invoked. Read
terminals accept one optional final execution-options parameter. Mutation
terminals accept the mutation input first and the same optional execution
options last:

```ts
await new Query(PostSchema).equalTo('published', true).find()

await new Query(PostSchema).byId(postId).update(
	{ set: { published: true } },
	{ useMasterKey: true },
)
```

Selection, input, cardinality, and result inference remain derived solely from
the schema and immutable Query branch. Execution options never enter the Query
AST, its JSON representation, adapter compilation, or schema inference.

### Ambient and explicit execution ownership

Without explicit ownership, a terminal uses the current Runtime execution
scope. Inside hooks this reuses the exact application, request identity,
transaction, cancellation signal, hook lease, recursion protection, and
nested-operation tracking. Deep helper functions can therefore construct and
execute a Query without receiving `HookContext` only to forward its query
capability.

When no Runtime scope exists, the terminal requires an explicit `ultimabase`
execution option. Runtime creates a fresh root request for that exact started
application. It never falls back to a process-wide default application. A
terminal with neither an active scope nor explicit ownership fails with
`MISSING_EXECUTION_CONTEXT` and explains how to supply the missing application.

The Query instance itself remains context-free and may be reused across
requests. Runtime resolves and validates the capability at each terminal. An
asynchronous branch that still carries a closed hook scope is rejected through
the existing revocable hook lease instead of silently opening a new root
operation. Finalization phases that prohibit queries remain non-queryable.

`context.query(schema)` and `ultimabase.query(schema)` are removed with the
public `BoundQuery` facade after their call sites migrate. `HookContext` remains
the immutable home for hook identity, request correlation, capability checks,
and transaction-bound event emission.

### Terminal-only authority selection

Execution authority is an operation concern and therefore appears only in the
terminal options. With no authority option, the terminal inherits the active
request or creates an anonymous internal request for an explicitly supplied
application.

Trusted backend code may pass `useMasterKey: true`. Runtime resolves this
through the exact application-owned master authority, preserves auditing, and
never accepts the flag from transport-normalized Query JSON or operation input.
Trusted backend code may instead pass a session token; an installed neutral
session resolver validates it before Runtime creates user access. Session and
master options are statically and dynamically mutually exclusive.

Changing authority for a nested hook Query never changes its application or
transaction. Master elevation bypasses only the policies declared by the
existing master matrix; structural validation, transactions, hooks, and other
non-bypassable behavior still execute normally.

## Consequences

- Backend helpers use `new Query(schema)` without context parameter plumbing.
- Query composition stays immutable, reusable, transport-neutral, and safe to
  share across concurrent requests.
- Every terminal has one consistent final options position and concise public
  IntelliSense.
- Ambient execution preserves hook rollback and lifecycle guarantees without a
  second public query class.
- Root scripts and jobs identify their application explicitly rather than
  relying on global mutable SDK configuration.
- Server code can deliberately choose inherited, session-user, or master
  authority, while transports cannot manufacture server execution options.
- Removing `BoundQuery` deletes its mirrored builder delegation and the need to
  keep two public surfaces synchronized.
