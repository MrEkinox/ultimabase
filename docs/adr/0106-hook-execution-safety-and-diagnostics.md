# ADR-0106: Hook execution safety and diagnostics

- Status: accepted
- Date: 2026-08-02
- Refines: ADR-0042, ADR-0062, ADR-0068, ADR-0089, ADR-0101, ADR-0105

## Context

Native schema, field, and plugin hooks may start nested operations through the
current request engine. Those operations intentionally retain the active
transaction, but an accidental call back into the same hook can otherwise form
an unbounded direct or indirect loop. Hooks also need one consistent request
cancellation signal, while operators need timing and failure diagnostics that
cannot expose credentials or influence business execution.

The complete transaction-bound capability API belongs to issue 340. Deferring
all execution context until that issue would leave issue 333 without a stable
public seam, while temporarily adding unrelated properties directly to every
hook input would create avoidable API churn.

JavaScript cancellation is cooperative. Racing a hook promise against a timer
would return control without stopping the hook, allowing detached code to keep
using transaction state after Runtime has started finalization. Diagnostic
callbacks present a similar boundary: their failure must never replace a hook
result, reorder business handlers, or change the error that caused rollback.

## Decision

### Durable minimal execution context

Issue 333 introduces the public immutable `HookExecutionContext` interface:

```ts
interface HookExecutionContext {
	readonly requestId: string
	readonly transactionId: string | undefined
	readonly signal: AbortSignal
}
```

Every native schema and field hook input receives this value through its
`context` property. Runtime alone constructs it from trusted request and
transaction state. A root operation outside a transaction has no transaction
identifier; automatic mutations and every operation inside one explicit outer
transaction share the same opaque transaction identifier.

`HookExecutionContext` is a durable minimum contract rather than a temporary
class. Issue 340 introduces the immutable `HookContext` class, which satisfies
this interface and adds transaction-bound queries, events, request authority,
hook identity, and lifecycle protection. Existing handlers that consume only
the issue-333 interface therefore remain valid.

The context exposes no request metadata, raw master key, adapter, mutable
pipeline state, transaction finalizer, or hook bypass control. Its
`AbortSignal` may combine request cancellation and a configured deadline, but
the arbitrary signal reason does not become public diagnostic data.

### Structural recursion identity

Runtime maintains an immutable hook execution stack in asynchronous local
storage. Every nested engine operation inherits the current stack, while
parallel sibling operations receive isolated immutable branches.

A hook identity represents one declaration occurrence, not merely one function
object. Its internal identity includes:

- the owning application and exact schema or field target identity;
- developer ownership or the plugin owner and local contribution identity;
- the schema target or exact structural field path;
- the hook phase and declared family branch;
- the handler's stable position in that declaration.

The current operation kind is retained in the diagnostic frame but does not
make an otherwise identical declaration a different hook. Re-entering an exact
identity already present in the current asynchronous stack fails immediately
with `HOOK_RECURSION`. Finite nested work targeting another hook, phase, field,
or schema remains supported and continues to use the current transaction-bound
engine.

The recursion error keeps only immutable safe structural diagnostics: owner,
phase, schema class, field path when present, operation kind, handler position,
and the corresponding sanitized execution stack. Operations, inputs, field
values, results, request metadata, credentials, raw causes, and adapter values
are never copied into that structure.

### Cooperative cancellation

Runtime checks the active signal before each sequential pre-commit handler and
at the safe boundaries surrounding hook execution. Once cancellation is
observed, Runtime starts no remaining pre-commit handler. A mutation becomes
rollback-only and uses the ordinary transaction error lifecycle; a read stops
without manufacturing rollback state.

Runtime does not use `Promise.race` to detach a running hook. The active handler
receives the aborted signal and Runtime waits for that handler to settle before
continuing rollback or transaction finalization. A handler that ignores its
signal cannot be forcibly terminated by JavaScript. Adapter-level interruption
requires the database adapter contract to accept and honor cancellation and is
not implied by this decision.

Deadlines use the same path through native `AbortSignal` composition, including
`AbortSignal.timeout()` where appropriate. Cancellation produces the stable
`OPERATION_CANCELLED` framework code. A timeout is an internal normalized
reason for that code rather than a second public error family. If a handler
independently throws while cancellation is observed, its handler error remains
the primary failure.

### Isolated diagnostic observer

Application assembly may configure an optional hook diagnostic observer. It
receives deeply immutable, redacted completion events containing only:

- the sanitized structural hook identity and owner;
- request and optional transaction identifiers;
- operation kind and hook phase;
- a non-negative monotonic duration;
- success, failure, or cancellation outcome;
- a stable framework error code when one safely applies.

Durations use a monotonic clock and stop before diagnostic delivery begins.
Events never contain the raw error, message, stack, cause, request metadata,
access credentials, operation payload, field value, or result.

Diagnostic delivery runs outside the active request-engine and hook-stack
scopes. The callback cannot obtain an ambient engine to start business work.
Runtime catches both synchronous throws and asynchronous rejections from the
observer. Such failures are never added to a business `AggregateError`, never
replace an original error identity, and never prevent later business hooks.
The diagnostic observer is distinct from developer `onError`, `afterCommit`,
and `afterRollback` hooks, whose documented business lifecycle semantics remain
unchanged.

### Stable errors and no bypass

The closed framework error union gains `HOOK_RECURSION` and
`OPERATION_CANCELLED`. Their actionable hook and cancellation details remain in
trusted `internalDetails`; transport serialization continues to use
`FrameworkError.toJSON()` and therefore omits them unless a separately reviewed
safe public detail is explicitly declared.

Runtime exposes no `skipHooks`, mutable stack, recursion-reset method, or
transport-derived bypass flag. Master authority changes access checks but does
not disable business hooks, recursion protection, cancellation, or diagnostic
boundaries.

## Consequences

- Direct and indirect same-hook loops fail deterministically without blocking
  legitimate cross-schema or cross-phase nested operations.
- Parallel operations cannot create false recursion through shared mutable
  stack state.
- Cancellation and timeouts preserve transaction lifetime safety, but a
  non-cooperative JavaScript handler may delay cancellation until it settles.
- Issue 340 can add the richer `HookContext` class without replacing the
  minimal execution-context contract introduced here.
- Diagnostic callbacks cannot access an ambient engine or alter business
  results and errors, at the cost of deliberately suppressing observer-owned
  failures from the request outcome.
- The two new framework codes extend the stable public error union and require
  exhaustive transport mappings to be reviewed.
