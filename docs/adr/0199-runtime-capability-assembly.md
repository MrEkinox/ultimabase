# ADR-0199: Runtime capabilities execute behind a Core-owned request shell

- Status: accepted
- Date: 2026-08-19
- Refined by: ADR-0205, ADR-0206
- Refines: ADR-0064, ADR-0186, ADR-0188, ADR-0190, ADR-0191
- Depends on: ADR-0186, ADR-0190, ADR-0191

## Context

ADR-0186 opens Runtime interception and replacement through declared
privileges, while ADR-0190 keeps application lifecycle and Runtime startup in
Core. Those decisions do not identify the exact replacement boundary. Replacing
the complete request engine would expose application ownership, authority,
cancellation, transaction lifetime, or protected policy state to one plugin.
Replacing too little would leave the old closed Runtime contribution registries
beside the public capability graph.

Runtime also needs separate contracts for transforming middleware, monotonic
policy contributions, and non-transforming observation. A generic provider or
setup registry would let one privilege impersonate another or retain mutable
registration state during request execution.

## Decision

### Core owns the mandatory shell

Core keeps application ownership, request construction, anonymous and audited
master authority, cancellation, adapter selection, automatic transaction
lifetime, and protected enforcement accumulation. Transport input cannot create
master authority, and a Runtime replacement receives neither master credentials
nor mutable protected policy state.

The replaceable unit is the application-local Runtime executor. Core supplies
the complete mandatory stage graph to one `RuntimeExecutorFactory`; the
canonical factory constructs `RuntimePipeline`. `replaceRuntime()` may replace
that factory under the critical `runtime:replace` privilege, but the resulting
pipeline still executes behind the Core-owned shell. A malformed replacement
fails during assembly before request execution.

### Four exact application capabilities

Runtime uses four versioned public protocols:

- `runtimeExecutorCapability` is `single` and has one canonical Core provider;
- `runtimeInterceptorCapability` is a deterministic `pipeline` for logical
  transforms and the public normalization or commit positions;
- `runtimeConstraintCapability` is `multiple` and contributes independent
  deny-only guards, adapter constraints, and narrowing field restrictions; and
- `runtimeObserverCapability` is `multiple` and contributes result-neutral
  hook or committed-event observers.

Providers must use `provideRuntimeInterceptor()`,
`provideRuntimeConstraint()`, or `provideRuntimeObserver()`. Those nominal
factories enforce `runtime:intercept`, `runtime:constrain`, and
`runtime:observe` independently. Generic capability providers, requirements,
replacements, and decorators cannot target these protected protocols, and
observers cannot return a replacement result. Runtime tokens remain public so
manifests and diagnostics share nominal protocol identities; they are not a
consumer view over accumulated middleware or constraints.

All four protocols have application lifetime. Core materializes them before
plugin setup, preserves owner and instance provenance, composes them in plugin
graph order, and disposes provider resources with their application. An absent
interceptor, constraint, or observer capability contributes no neutral handler.

### No Runtime setup registry

The former `runtime`, `events`, and `pipeline` setup facades and their backing
stores are removed. Request execution reads only the materialized application
capability values. Event publication checks the exact owner privilege through
an immutable application-bound assertion and does not retain or consult setup
registry storage.

Native Hooks and Access setup facades remain temporarily to preserve accepted
behavior until milestone 15 extracts them through the same public kernel.

## Consequences

- Community and official plugins use the same public Runtime protocols.
- Runtime replacement cannot relocate application, master, cancellation,
  transaction, or protected-policy ownership out of Core.
- Privilege diagnostics identify the exact Runtime power instead of a generic
  contribution category.
- Application isolation and cleanup follow the existing capability lifecycle.
- Persistence-plan rewriting remains a separate boundary owned by issue 1410.

## Non-goals

- Replacing the plugin or application lifecycle.
- Exposing protected enforcement accumulation to ordinary middleware.
- Defining persistence-plan replacement or plugin operation execution.
- Extracting native Hooks or Access before milestone 15.
