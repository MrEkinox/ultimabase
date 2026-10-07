# ADR-0092: Bound queries require executors

- Status: superseded
- Date: 2026-08-02
- Refines: ADR-0061, ADR-0067
- Superseded by: ADR-0108

## Decision

An unbound `Query` owns reusable query composition. `Query.bind(executor)` only
accepts the transport-neutral execution capability shared by
`QueryOperationExecutor` and multi-schema Runtime engines. Every resulting
`BoundQuery` is therefore executable. Arbitrary context objects cannot be
attached merely to carry them through immutable query branches.

`@ultimabase/query` remains independent from Runtime because the executor is a
neutral package contract. `RequestEngine` satisfies it without Query importing
Runtime, a transport, or a database adapter. The exact executor type is still
retained by the bound instance.

The static constraint is repeated at the JavaScript dispatch boundary. Forced
casts and untyped consumers still receive a runtime error if the retained value
does not expose an execution function.

## Consequences

Plugins and application code use an unbound `Query` when they only need to
compose or transport query state. A bound query has one unambiguous meaning:
its terminals can execute through the mandatory pipeline.

Terminal signatures no longer need conditional input types or explicit
capability-checking `this` parameters. Editor hovers expose only developer
inputs and operation results, while TypeScript rejects invalid binding at the
earliest call site. Tests that need a binding use a focused recording executor
instead of an unrelated placeholder object.
