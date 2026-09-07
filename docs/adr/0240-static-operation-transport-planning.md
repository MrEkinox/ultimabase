# ADR-0240: Core plans static operation transport descriptors

- Status: accepted
- Date: 2026-09-08
- Refines: ADR-0225, ADR-0233 and ADR-0238
- Depends on: ADR-0190, ADR-0191, ADR-0207 and ADR-0208

## Context

GraphQL must validate operation root names and supporting types while its
application capability is materialized. At that point the final operation and
binding declarations exist, but Core has not constructed the application
engine. The existing `ApplicationRequestExecutor.exposeOperations()` facade is
intentionally unavailable until startup finishes because it carries executable
wire codecs and Runtime delegation.

Giving GraphQL the generic operation-binding capability would expose another
plugin's contribution values and executable codec boundary. Delaying schema
compilation until transport startup would make the public schema unavailable
during setup and would weaken deterministic startup validation. Exposing a
framework application, engine, operation Runtime, or registry would violate the
narrow transport boundary accepted by ADR-0225.

## Decision

Core owns the non-replaceable application capability
`ultimabase.application-operation-transport-planning@1.0.0`. It is installed
only when a plugin explicitly requires it for materialization.

An attributed caller with active `transport:expose` may call `plan()` with one
canonical operation transport protocol and an ordered list of exact
application-operation tokens. Core then validates that:

- every token is the exact installed application operation declaration;
- one exact binding exists for the selected canonical protocol;
- the binding has the same plugin and optional instance owner as the operation;
- duplicate selections and incompatible targets fail before a plan is returned.

The returned immutable plan contains only operation name, version, declared
public error codes, owner identity, and snapshotted inert binding metadata. It
contains no codec, handler, callback, application, engine, request context,
authority, transaction, adapter, Runtime facade, or generic registry access.
Core materializes the internal binding capability before the planner and binds
those contributions privately; consumers cannot request or enumerate that
capability through the planner.

Static planning does not execute or authorize a request. A transport still
creates the executable allowlist through
`ApplicationRequestExecutor.exposeOperations()` after the application engine is
ready. A transport that compiled a plan must verify that this late-bound facade
has the same canonical protocol and exact descriptors before accepting work.
Execution continues exclusively through that facade.

GraphQL uses the planning capability to compile its operation roots during
application capability materialization, then binds the matching Core execution
facade during `startTransports`. The operation protocol is a private bridge
inside the one GraphQL public surface, so GraphQL acknowledges its bridge
diagnostic and reports public-protection uncertainty once under
`ultimabase.graphql@1.0.0`.

## Consequences

- Transports can validate a deterministic public shape before startup without
  receiving executable operation internals.
- Operation owners and transports remain decoupled through canonical protocol
  identity and inert metadata.
- Planning and execution compare the same descriptors but remain separate
  lifecycle phases.
- The capability deliberately supports only application-targeted operations.
  Schema and model commands remain on their application-owned handles.
- A future transport needing more static facts must refine this ADR rather than
  gain a generic capability or Runtime lookup.
