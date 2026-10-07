# ADR-0231: Core request executors accept normalized schema reads

- Status: accepted
- Date: 2026-09-05
- Refines: ADR-0004, ADR-0225
- Depends on: ADR-0004, ADR-0199, ADR-0206, ADR-0225

## Context

ADR-0225 gives transports a narrow application-owned request facade, but its
first version can only enter an attributed callback or an explicitly exposed
plugin operation. REST read normalization now produces Core's existing
operation AST and needs to execute it without capturing `UltimaBase`, a Runtime
engine, or an adapter.

Using a schema class command would require a transport to receive an
application object. Exposing a general operation executor would also let a read
issue accidentally widen into mutations or internal Runtime control.

## Decision

`ApplicationRequestExecutor` adds `executeRead(context, operation)`. The type
boundary accepts only the normalized Core read discriminants and retains their
exact `OperationResult`. The implementation validates the attributed plugin,
application lifecycle, request-context provenance, and cancellation before it
enters the existing application request-engine scope and one operation
pipeline.

REST exposes a focused execution function that normalizes the Fetch request and
delegates the resulting AST to `executeRead`. It returns the logical Core result
to its caller. Response encoding, HTTP error mapping, routing, and streaming
remain later REST boundaries.

`count` and `exists` remain their native logical operations. Strict `get`,
Access, ACL, inclusions, projections, hooks, protected constraints,
materialization, and Master bypass therefore retain the same Runtime semantics
as direct Query execution.

## Consequences

- REST reads use the application-owned Runtime without receiving its engine,
  adapter, application object, authority, transaction, or lifecycle controls.
- Anonymous, plugin-valued anonymous, and verified Master contexts retain the
  exact application provenance and cancellation signal.
- Mutation execution requires a separately reviewed facade method.
- HTTP and wire-only values are consumed during normalization and never enter
  the operation AST.

## Non-goals

- REST mutation or plugin-operation execution.
- Route matching, response serialization, error envelopes, or streaming.
- A generic public Runtime or arbitrary AST execution facade.
