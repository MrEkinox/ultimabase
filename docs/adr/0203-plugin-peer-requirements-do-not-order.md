# ADR-0203: Plugin peers validate compatibility without ordering

- Status: accepted
- Date: 2026-08-20
- Depends on: ADR-0190, ADR-0195, ADR-0202

## Context

A plugin may intentionally extend another plugin's public capability protocol.
The extension must fail when the engine is absent or incompatible, but a normal
plugin dependency is stronger than that contract: it also adds lifecycle and
static-declaration order.

This becomes cyclic when the engine consumes contributions from its extension.
The extension-to-engine dependency and the engine-to-contribution capability
edge point in opposite directions even though materialization itself is valid.

Setup-phase capability requirements solve a different problem. They permit two
installed plugins to read each other's already materialized values during
setup; they do not express package-level compatibility with a plugin whose
capability contribution is consumed by the peer.

## Decision

`definePlugin()` and `definePluginModule().plugin()` accept `peers`. Each peer
uses the same structured plugin ID, optional exact instance ID, and semantic
version range as a named dependency.

Core validates that every peer is installed, unambiguous, and compatible.
Peers add no graph, declaration, setup, lifecycle, materialization, teardown,
or disposal edge. Configuration and real dependency/capability edges remain the
only sources of order.

A plugin must use `dependencies` when it requires provider-first declaration or
lifecycle order. It uses `optionalDependencies` when that ordering applies only
if the target is installed. It uses `peers` only when presence and compatibility
are required but ordering would be false coupling.

Official Hooks-compatible extensions declare `@ultimabase/hooks-plugin` as a
peer and provide the official contribution capability. Independent behavior
engines do neither. ACL and Roles do not peer with Hooks because their invariant
behavior targets Core's generic Runtime capability directly.

## Consequences

- Community extensions can require one exact compatible engine without a
  manufactured dependency cycle.
- Peer validation retains duplicate-instance and semantic-version diagnostics.
- A peer declaration grants no capability read, privilege, setup export, or
  lifecycle guarantee.
- Existing dependency semantics remain unchanged.
