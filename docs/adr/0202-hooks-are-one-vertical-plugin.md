# ADR-0202: Hooks is one vertical plugin

- Status: accepted
- Date: 2026-08-19
- Refines: ADR-0189, ADR-0194
- Refined by: ADR-0204
- Depends on: ADR-0189, ADR-0190, ADR-0191, ADR-0199

## Context

ADR-0194 planned a dependency-light `@ultimabase/hooks-contracts` package so
the official Hooks implementation and community alternatives could share one
engine token. That split treats alternatives as interchangeable
implementations of the official lifecycle even when they intentionally expose
different phases, declarations, and developer experiences.

Hooks declarations also contain executable callbacks. Core's generic schema
option contracts deliberately accept immutable JSON values, so moving Hook
authoring before Hook execution would require either a temporary private Core
bridge or a broader callback-bearing schema-option mechanism used only during
the migration. Both would add architecture that the final system does not need.

## Decision

### One official package

UltimaBase publishes one Hooks package: `@ultimabase/hooks-plugin`. It owns its
public callback types, schema and field authoring contracts, contribution
selectors, diagnostics, dispatcher, and Runtime integration.

Importing the package installs no behavior. The application must configure the
exported plugin definition explicitly. Plugins that intentionally extend,
decorate, or replace the official Hooks lifecycle may import its public
versioned capability contracts from this package. They declare Hooks through
ADR-0203's non-ordering `peers` contract when the engine consumes their
capability contributions.

There is no `@ultimabase/hooks-contracts` package.

### Alternatives are independent engines

A community behavior engine uses Core's public schema-extension, Typegen,
capability, middleware, transaction, cancellation, and post-commit contracts.
It owns its vocabulary and capability identity and does not depend on the
official Hooks package.

Different behavior engines are not forced to conflict merely because both can
observe an operation. Natural capability, model-surface, option-namespace, or
middleware conflicts still fail through the public kernel's deterministic
rules. A plugin claiming compatibility with the official lifecycle uses the
official package contract and its cardinality rules.

### Atomic extraction

Hook authoring and execution move out of Core in one issue. The migration does
not leave a hidden Core dispatcher, a callback-bearing generic option added for
transition purposes, or a Core branch that imports or recognizes the official
plugin.

Core retains only generic Runtime mechanisms. Applications without the official
plugin expose no official Hook authoring vocabulary and allocate no official
Hook execution state.
An inline `hooks` property in such an application is rejected as an unknown
schema or field option. Core does not identify the absent official owner because
doing so would require a Hooks-specific registry or branch. Once the plugin is
installed, its static declarations provide validation, Typegen, autocomplete,
and exact callback inference.

### Generic Runtime behavior boundary

Core exposes an application-lifetime `runtimeBehaviorCapability`. A provider
supplies optional handlers at the existing logical input, prepared-target,
pre-persistence, materialization, output, result, and post-commit boundaries.
Core composes providers in deterministic plugin-graph order while retaining
authority, protected enforcement, transaction ownership, persistence-plan
identity, and final result validation.

The boundary names operation effects rather than Hook phases. It installs no
neutral provider and allocates no behavior bundle when unused. Supplying it
requires `runtime:intercept`; replacing the complete Runtime remains a separate
and more privileged operation.

Capability owners may attach one `providerPrivilege` from Core's closed
privilege vocabulary to a token. Core rejects every provider or replacement
whose owner did not request that active privilege before declaration
composition or application materialization. The Hooks contribution protocol
uses `runtime:intercept`; its committed-event consumers use `runtime:observe`.
Execution authority therefore stays attached to the plugin whose callback
runs instead of being laundered through the official Hooks provider.

ACL and Roles do not use the official lifecycle for their own invariants. They
provide generic Runtime behavior directly, so neither package depends on or
peers with Hooks. Their committed notifications use plugin-owned event
capabilities built from public plugin-kit and transaction primitives.

### Access remains unchanged

ADR-0194's decision for `@ultimabase/access-contracts` remains accepted. Access
has independent policy providers that need neutral shared contracts across the
selected engine and ACL, roles, adapter constraints, and subject integrations.

ADR-0204 later refines this section by placing official Access contracts in the
single `@ultimabase/access-plugin` package and leaving independent alternatives
on the generic kernel.

## Consequences

- Official Hook extension authors have one dependency and one documentation
  surface.
- Alternative behavior engines are not coupled to the official phase model.
- The extraction has no unsupported intermediate Runtime state.
- Issue 1502 is merged into issue 1501 rather than delivered as a second
  architectural step.

## Non-goals

- Changing accepted official Hook ordering or transaction semantics.
- Defining one universal protocol for every behavior engine.
- Changing the Access contract-package decision.
