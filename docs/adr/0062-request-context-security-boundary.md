# ADR-0062: Request context security boundary

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0004, ADR-0013

## Decision

`@ultimabase/access` defines the closed `RequestAccess` union. Its only modes
are `anonymous`, `user`, and `master`. Anonymous access contains no user state,
user access requires one stable user identifier, and master access requires a
non-empty audit reason. Authentication-provider credentials and claims do not
enter this foundational contract.

`@ultimabase/runtime` owns the immutable `RequestContext` class. Public static
factories create anonymous and authenticated user contexts. They require a
non-empty request ID and source, copy and freeze metadata and capability
collections, reject unknown options, and reject master-key metadata. Built-in
sources are `rest`, `graphql`, `job`, and `internal`; custom plugins may retain
their own non-empty source literals.

Request capabilities are frozen class tokens compared by object identity. A
transport value containing the same public capability name cannot reconstruct
the token and therefore cannot grant itself that capability.

Master context construction exists only behind a Runtime-internal closure and
is omitted from the package entry point. Issue 319 will connect that boundary
to trusted `RequestEngine` authority and audit events. Until then, neither a
transport nor regular public context construction can select master mode. Raw
master keys are verification inputs for a future trusted service and are never
stored in request options, metadata, access state, or the Operation AST.

## Consequences

Runtime stages can switch exhaustively on `context.access.mode` without a
fourth system branch. Jobs use either explicit user access or audited master
access rather than receiving implicit authority from their source.

Permission and infrastructure plugins can export stable capability tokens and
check them through `context.hasCapability(token)`. Capability names remain
diagnostic labels, not security credentials.
