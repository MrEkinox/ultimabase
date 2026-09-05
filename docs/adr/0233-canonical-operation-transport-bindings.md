# ADR-0233: Operation transport identities are canonical and bindings carry inert metadata

- Status: accepted
- Date: 2026-09-05
- Refines: ADR-0193, ADR-0225, ADR-0228
- Depends on: ADR-0190, ADR-0193, ADR-0225, ADR-0230

## Context

REST v1 exposes plugin operations only through Core's nominal operation
transport bridge. The operation owner must contribute its codec and binding,
while the REST plugin independently consumes that binding. Requiring both
packages to share one JavaScript token object would force an operation package
such as Password Auth to import REST, contrary to the accepted sibling
dependency graph.

ADR-0228 also requires the operation owner to map its complete declared public
error vocabulary to HTTP statuses before startup. Core must remain unaware of
HTTP, but the selected transport needs immutable facts with which to validate
that mapping before it accepts requests.

## Decision

`defineOperationTransport({ name, version })` returns the process-canonical
nominal identity for that exact name and semantic version. A separately loaded
operation owner and transport therefore meet through Core without importing
one another. Different versions remain different identities. This is an
identity cache, not an application registry, exposure registry, or discovery
mechanism.

`operationTransportBinding()` may retain one deeply snapshotted JSON metadata
value. Core validates and exposes that value without interpreting it. The
application transport facade publishes only immutable descriptors for its
fixed allowlist: operation name, version, declared public errors, exact owner,
and binding metadata. It exposes no handler, codec callback, engine, adapter,
authority, grant, transaction, or application identity.

REST v1 interprets only its own binding metadata. It requires the exact shape
`{ errors: { [declaredPublicErrorCode]: httpStatus } }`, rejects missing,
extra, non-error, or non-integer mappings, and validates every status is in the
400 through 599 range. Validation occurs in the transport-start lifecycle
after Core has bound the application request executor and before startup
completes.

REST route configuration still selects exact operation tokens explicitly.
Canonical protocol identity and metadata do not discover, install, or expose
an operation automatically.

## Consequences

- Password Auth can later bind its operations to REST v1 using Core alone.
- REST does not import or identify Password Auth or another operation owner.
- Core remains transport-neutral while REST can reject incomplete public error
  mappings before serving traffic.
- JavaScript, TypeScript, and Typegen consumers retain one operation token and
  one Runtime execution path.
- Binding metadata is deliberately inert and transport-owned; it is not a new
  generic capability or service registry.

## Non-goals

- Automatically exposing installed plugin operations.
- Defining HTTP statuses, response envelopes, or REST errors in Core.
- Supporting schema-targeted or model-targeted protocol-1 operations.
- Adding protocol discovery, string service lookup, or a compatibility alias.
