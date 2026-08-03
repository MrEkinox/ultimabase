# ADR-0114: Terminal-only Query authority resolution

- Status: accepted
- Date: 2026-08-03
- Refines: ADR-0071, ADR-0108, ADR-0113

## Context

ADR-0108 placed trusted execution choices in the final Query terminal argument,
and ADR-0113 removed credentials and native user authority from that boundary.
The implementation must apply an already-derived plugin context or audited
master authority without adding state to the immutable Query, escaping an
active hook lease, or opening a second transaction.

The public options must also stay concise in editor hovers. A union containing
several declarations of the same optional property causes TypeScript to lose
that property's documentation even though its value type remains correct.

## Decision

### One compact options interface

Every Query terminal accepts the same `QueryTerminalOptions` in its final
execution-options position. It has three optional properties:

- `ultimabase` selects exact root application ownership;
- `context` supplies one immutable `RequestContext` already derived by trusted
  application or plugin code;
- `useMasterKey` accepts only the literal `true` and requests audited master
  authority.

Omitting `context` and `useMasterKey` inherits the active request, or creates an
anonymous internal request when `ultimabase` is supplied. Combining `context`
and `useMasterKey: true` elevates that exact context and retains its typed
values. A single interface represents every valid combination without
duplicating property declarations or losing IntelliSense documentation.

Bulk terminals add only `atomic` to this same interface. Normalization copies
the terminal values into a frozen private record, while Query and Operation AST
nodes remain unchanged.

### Runtime-owned resolution

Query execution keeps a private weak registration from each erased executor to
its Runtime authority handler. A normal terminal still calls the executor
directly. A terminal with `context` or `useMasterKey` asks that registered
handler to derive another request engine with the same framework, pipeline, and
transaction lifetime.

Hook query guards register a forwarding authority handler behind the same
revocable lease. Nested authority changes therefore retain application
identity, transaction rollback, cancellation, recursion protection, lifecycle
tracking, and unawaited-query draining.

An explicit context is claimed by its first application binding. Context value
derivation and master elevation inherit that private owner. Reusing the context
with another application fails before adapter execution. Outside an ambient
scope, a context has no implicit global owner and requires the exact
`ultimabase` option.

### Trusted terminal master audit

`useMasterKey: true` is an API available only to developer-authored backend
code. The exact application-owned `MasterAuthority` creates and audits the
master context before execution. The first configured key ID is the stable
audit identity for this trusted terminal path; its raw value is neither retained
nor verified again. The generated reason identifies the operation kind and
schema.

Missing authority configuration or audit failure prevents the operation.
Explicit raw-key verification remains available through
`FrameworkEngine.authorizeMasterKey()` and `RequestEngine.useMasterKey()` for
transport and operational boundaries that receive a credential.

### Transport separation

Terminal options are not part of Query JSON, Query ASTs, Operation ASTs,
database requests, adapter options, diagnostics, or event payloads. A transport
normalizes client input into an operation and executes it through its already
constructed request engine. It never forwards client fields into the trusted
terminal options argument.

## Consequences

- Backend helpers can inherit a request, supply a plugin context, or request
  master authority without context plumbing through every function.
- All singular and collection terminals share one documented option surface.
- Context and master overrides remain inside current hook and transaction
  safety boundaries.
- Context reuse cannot cross isolated applications after its first binding.
- The ordering of configured master keys determines the audit identity used by
  trusted terminal elevation and must therefore remain intentional.
- Authentication credentials and provider-specific session semantics remain
  entirely outside Core Query execution.
