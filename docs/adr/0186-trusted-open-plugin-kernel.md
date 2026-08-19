# ADR-0186: Trusted open plugin kernel and declared privileges

- Status: accepted
- Date: 2026-08-11
- Refines: ADR-0003, ADR-0045, ADR-0047, ADR-0048, ADR-0049, ADR-0075
- Refined by: ADR-0187, ADR-0188, ADR-0189, ADR-0190, ADR-0191, ADR-0199

## Context

UltimaBase already resolves one deterministic application-local plugin graph,
binds setup contributions to their real owner, and gives plugins typed lifecycle
and service registries. The available contribution categories are nevertheless
closed over concepts already known by Core. A community package cannot define a
new cross-plugin protocol, transform every relevant application declaration, or
replace a foundational implementation without Core first adding a dedicated
category.

That boundary limits the ability of the ecosystem to maintain and extend the
framework independently. Installed Node.js packages are already trusted
application code with the process permissions granted by the developer. The
framework should therefore make their UltimaBase powers explicit, deterministic,
and inspectable instead of pretending to sandbox them through a narrow registry.

## Decision

### Core is an open microkernel

Core owns application isolation, plugin graph resolution, privilege validation,
static compilation, capability composition, lifecycle, request execution,
transactions, master authority, and diagnostics. Concrete product behaviors are
implemented through public plugin contracts.

Plugins may contribute, decorate, or explicitly replace application
capabilities. Official plugins use the same public contracts and authoring tools
as community plugins. Core and official packages have no private plugin path.

### Versioned capabilities

`defineCapability()` creates one immutable namespaced protocol token with an
explicit version and cardinality:

- `single` accepts one provider unless an authorized replacement is declared;
- `multiple` accepts independent providers in deterministic graph order;
- `pipeline` composes ordered handlers in deterministic graph order.

Plugins may `provide`, `require`, `decorate`, or `replace` a capability. A
requirement selects a compatible protocol version rather than a concrete plugin
name. Named plugin dependencies remain available when a package-specific
contract is genuinely required. Capability ownership and resolution remain
application-local.

### Declared privileges

Every plugin definition declares the concrete UltimaBase privileges it may use.
Privileges cover sensitive host powers such as schema transformation, Runtime
interception or replacement, persistence-plan rewriting, transport exposure,
authority elevation, Typegen contribution, filesystem output, and network
access. Plugins do not request wildcards.

`UltimaBase` accepts an application policy whose default is to allow requested
privileges while supporting global, plugin-ID, and exact-instance deny lists.
Denials accumulate; a narrower rule cannot override a broader denial. A later
strict allow-list mode may refine the same policy without changing plugin
manifests.

The complete flattened graph, including nested plugins, is checked before any
declaration callback, schema transformation, Typegen contribution, setup,
connection, or infrastructure lifecycle hook runs. Core reports every plugin,
version, active privilege, inactive conditional privilege, and denial through a
structured logger. All denials are aggregated into one
`PLUGIN_PRIVILEGE_DENIED` failure.

Owner-bound contexts expose only the privileged facades requested and allowed
for that plugin. Privileges never transfer through dependencies. In particular,
`runtime:replace` does not grant master authority, and only the existing audited
Core boundary may provide `authority:elevate`.

This policy controls UltimaBase APIs and accidental overreach. It is not an OS or
Node.js sandbox. Inspecting a package before any module evaluation would require
a separate package manifest loader or process isolation and remains a future
hardening option.

### Ordering and introspection

Application construction follows this order:

```text
normalize configuration
→ resolve the complete plugin graph
→ validate manifests, capability requirements, and active privileges
→ emit the structured plugin and privilege report
→ run static declarations and application compilation
→ run optional Typegen
→ run setup and validate contributions
→ connect and prepare infrastructure
→ assemble and start Runtime and transports
```

Every capability, declaration, transformation, handler, and replacement records
its plugin owner and protocol version. The application exposes a read-only
inspection model that can explain installed plugins, privileges, capabilities,
schema provenance, and replacement chains without exposing secrets or writable
registries.

### Public plugin authoring toolbox

Kernel security primitives such as `definePlugin`, `defineCapability`, owner
binding, and privilege enforcement remain Core responsibilities. Repeated
ergonomic composition belongs to a non-plugin `@ultimabase/plugin-kit` package.
It provides typed helpers for options, selectors, patches, operations,
middleware, codecs, Typegen references, stable identities, and diagnostics
without bypassing ownership or privilege checks.

`@ultimabase/testing` owns the complementary plugin conformance harness. Official
plugins must use the public kit and conformance contracts whenever applicable.

## Consequences

- Community plugins can define protocols and compose without Core knowing their
  product vocabulary.
- Powerful behavior remains visible and can be denied before application
  effects begin.
- Deterministic graph order, conflict detection, teardown, and application
  isolation remain mandatory even for privileged plugins.
- Core gains stable capability and privilege ABIs that require versioned
  compatibility tests.
- A malicious in-process package is still trusted Node.js code; stronger
  isolation is deliberately not claimed.

## Non-goals

- Installing plugins automatically from a marketplace.
- Process, Worker, filesystem, or network sandboxing.
- Hot reloading a compiled plugin graph.
- Granting authority through transport input or plugin dependency inheritance.

## Implementation refinement: focused public authoring helpers

Issue 1411 publishes `@ultimabase/plugin-kit` with only helpers justified by
current official plugins or repeated milestone fixtures. The package binds
stable module manifest facts, centralizes strict immutable option roots, builds
common additive schema patches through Core-created operations, flattens the
application capability wrapper for operation handlers, and groups nominal
Typegen references by public module.

Every helper delegates its security-sensitive boundary back to public Core APIs.
The kit cannot assign an owner, grant a privilege, store a capability, mutate a
registry, manufacture Master, open an adapter, or hide destructive cross-owner
schema transformations. Core never imports the kit, and importing the kit
installs no plugin or Runtime stage.

## Implementation refinement: public conformance harness

Issue 1412 publishes a runner-agnostic `@ultimabase/testing` suite over public
Core inspection, application, Runtime, and optional Typegen APIs. The common
suite verifies manifest facts, explicit instance composition, cumulative
privilege and environmental-claim denial, capability contracts and
materialization, callback-free static determinism, provenance, lifecycle
cleanup, and application isolation. Optional named verifiers keep operations,
schema/model surfaces, transports, middleware, persistence plans, codecs,
migrations, orphan handling, and adapter failures specific to the plugin under
test.

The harness creates a fresh fixture for every invariant and disposes every
application or Runtime facade it creates. It never reads private registries,
manufactures owner identity, or grants missing privileges. Generic Typegen is
an explicit optional check; JavaScript operation checks execute without Typegen,
and the baseline has no PostgreSQL dependency. Official plugins consume the
same root package exports as community plugins.
