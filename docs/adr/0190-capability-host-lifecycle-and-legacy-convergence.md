# ADR-0190: Capability host lifecycle and legacy convergence

- Status: accepted
- Date: 2026-08-11
- Refines: ADR-0043, ADR-0044, ADR-0046, ADR-0048, ADR-0049, ADR-0047, ADR-0186
- Depends on: ADR-0186
- Refined by: ADR-0191, ADR-0192, ADR-0193, ADR-0194, ADR-0195

## Context

ADR-0186 accepts a versioned open capability kernel, but Core already exposes
three overlapping plugin protocols: exclusive string slots, nominal services,
and named setup contribution registries. Leaving those public paths beside the
new capability graph would preserve duplicate dependency systems and could let
a plugin bypass a denied privilege through an older generic registry.

Capabilities also need to distinguish pure declarations known before schema
compilation from resource-backed implementations that can exist only after
plugin setup.

## Decision

### Plugin and instance identity

Every plugin has one stable namespaced `pluginId` and semantic package version.
Configuration may additionally assign an explicit non-empty `instanceId`.
Ownership, diagnostics, privileges, setup exports, and contributions use the
structured pair `{ pluginId, instanceId? }`; they never concatenate an
ambiguous user-controlled string.

The same plugin may be configured several times only through distinct explicit
instance IDs. Repeating the same definition object at the same identity remains
nested-composition reuse. A duplicate structured identity is an error.

Named dependencies may require a plugin version range and, only when genuinely
necessary, one exact instance. Capability requirements remain preferred because
they allow alternative providers. Nested children depend on the exact parent
instance that introduced them.

### Two capability lifetimes

A capability token declares one protocol identity, version, cardinality, and
lifetime:

- `declaration` capabilities contain immutable serializable facts available
  during static application compilation;
- `application` capabilities declare their provider statically, then materialize
  an application-local implementation during setup through a Core-owned factory.

Application factories receive only the plugin's allowed facades, static safe
options, and runtime options. They may acquire services, secrets, adapters, or
network resources without placing those values in static fingerprints. Core
owns their disposal through the existing deterministic lifecycle.

Capability requirements and compatibility are validated before static
declarations. A declaration capability value is available immediately after
that validation. An application capability handle becomes callable only after
successful materialization and cannot escape application disposal.

### Composition matrix

- `single` accepts one provider, whole-capability decorators, and an explicit
  owner-targeted replacement.
- `multiple` accepts ordered independent providers. Decoration is invalid;
  replacement targets one exact provider contribution and preserves its
  position.
- `pipeline` accepts ordered handlers. Replacement targets one exact handler;
  decoration wraps the compiled pipeline rather than individual handlers.

Providers and handlers are ordered by dependencies, configuration position,
then registration order. Whole-capability decorators use the same order, with
the earliest dependency outermost so its entry work runs first and its exit
work runs last. Replacement chains are linear, owner-targeted, inspectable, and
reject branches or cycles.

Optional capability use is explicit. Reading a capability that was neither
required nor declared optional is rejected even if a compatible provider
happens to be installed.

### Converge legacy plugin paths

Public plugin-to-plugin services become application-lifetime capabilities.
Core may retain a private resource store and native explicit-resource cleanup
to materialize capability implementations, but plugins do not receive a
general service registry.

Exclusive `slot` declarations migrate to `single` capability tokens. The public
string slot API is removed after every current slot has a canonical token.

The generic named registries for extensions, operators, hooks, generators,
transports, pipelines, events, and commands migrate to typed capabilities or
privilege-scoped hosts. The general `registries` escape hatch is removed. A
temporary bridge may exist only inside one migration issue, must enforce the
same owner and privilege checks, and is deleted before milestone 14 completes.

Core keeps the plugin graph and lifecycle phases as mandatory kernel
mechanisms. Setup, connect, schema preparation, Runtime start, transport start,
stop, and dispose are not replaceable capabilities because they establish the
boundaries in which every capability is validated and cleaned up.

### Protocol compatibility

The Core plugin ABI follows the package's semantic major version. Capability
protocol versions evolve independently. A breaking protocol change uses a new
major version; Core never assumes two majors are compatible. Providers may
temporarily offer several protocol versions as distinct declarations, and the
inspection model reports the exact version selected by every consumer.

## Consequences

- Privilege-scoped capabilities become the only public cross-plugin extension
  path.
- Resource-backed implementations remain possible without contaminating static
  compilation or Typegen.
- Multiple explicit plugin instances support repeated infrastructure without
  weakening deterministic ownership.
- Slots, services, and generic registries cannot silently survive as alternate
  plugin kernels.

## Non-goals

- Hot replacement after compilation.
- Inferring instance IDs from plugin options.
- Comparing closure state to deduplicate separately created definitions.
- Changing the fixed application lifecycle phases.
