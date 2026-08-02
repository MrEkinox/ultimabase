# ADR-0065: Application-owned request engines

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0004, ADR-0013, ADR-0050, ADR-0061, ADR-0064
- Refined by: ADR-0108

## Decision

`@ultimabase/runtime` provides two immutable execution boundaries.
`FrameworkEngine` owns one exact `FrameworkApplication`, its mandatory
`RuntimePipeline`, and its transaction runner. It carries no request authority.
It creates `RequestEngine` instances for anonymous, authenticated user, and
internal trusted-master contexts.

`RequestEngine` retains the exact framework identity and immutable
`RequestContext`. Its `query(schema)` method returns the neutral `BoundQuery`
facade with that request engine as its execution owner. Its low-level
`execute(operation)` method sends normalized operations through the retained
pipeline. Its `transaction(callback)` method delegates to the application-owned
runner while preserving the exact schema tuple, plugin tuple, and context type.

Both query binding and direct operation execution require the exact schema
object registered by the application. Matching a `className` is insufficient.
This identity check prevents two parallel applications with structurally equal
schemas from accepting each other's queries or operations.

Direct `RequestEngine` construction requires a module-private construction key.
JavaScript callers are rejected at runtime, while TypeScript callers cannot
produce the private key. All normal request engines therefore inherit their
application, pipeline, and transaction runner from one `FrameworkEngine`.

Public factories create only anonymous and user authority. Runtime retains an
internal trusted-master construction path with a mandatory reason, but omits it
from the package entry point until issue 319 adds audited `useMasterKey`
semantics. Transport input can never select master mode.

## Consequences

Every transport and direct server-side call can share the same typed,
application-scoped execution owner. Immutable query branches retain request
identity without importing Runtime into `@ultimabase/query`.

Runtime assembly must currently provide a transaction runner explicitly. Issue
317 will implement adapter-backed commit, rollback, escaped-engine protection,
and the nested transaction policy behind this stable callback shape. Issues 315
and 316 will add query and mutation terminals that build Operation AST nodes and
call the same engine execution boundary.
