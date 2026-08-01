# ADR-0076: Application-owned Runtime assembly

- Status: accepted
- Date: 2026-08-01
- Refines: ADR-0047, ADR-0050, ADR-0063, ADR-0064, ADR-0065, ADR-0070, ADR-0072
- Refined by: ADR-0090

## Decision

`createFrameworkEngine(application, options)` is the normal public assembly
boundary between an initialized `FrameworkApplication` and Runtime. The factory
preserves the application's exact schema and plugin tuples and accepts only the
`ready` and `started` lifecycle states. Direct `FrameworkEngine` and
`RuntimePipeline` construction remain available as low-level boundaries.

Assembly resolves the single `DatabaseAdapter` through
`databaseAdapterServiceToken`. Core's one-provider service rule establishes
cardinality, while Runtime validates the adapter discriminant and executable
transaction surface before creating the engine. Missing and malformed adapters
therefore fail before the first operation.

Runtime installs structural validation and the five hook/event stages itself.
Plugins may contribute the remaining extensible positions with the
provenance-protected `runtimePipelineStage({ stage, handler })` factory.
`normalization` and `commit` handlers compose in dependency-first plugin order.
The `clp`, `acl`, and `fieldPermissions` positions each have one exclusive
owner; competing owners fail with `PLUGIN_CONFLICT` rather than relying on
configuration replacement.

Every unclaimed extensible position receives an explicit neutral handler.
Neutral ACL and field-permission stages preserve the immutable empty constraint
collection supplied by the pipeline. Schema validation, database execution,
hooks, and post-commit events are never replaceable through the generic pipeline
registry.

Factory options configure structural validation and may carry one optional
`MasterAuthority`. They do not create another authority path or expose raw
master credentials.

## Consequences

Application developers no longer construct twelve low-level stages to execute a
bound `Query`. Database, hook, validation, transaction, and request-engine
behavior now share one application-owned assembly path without importing a
concrete database or permission plugin into Runtime.

Pipeline contribution metadata exposes only its stage identity; handler
implementations remain in Runtime-owned weak storage. Forged definitions,
unknown stages, invalid handlers, exclusive-owner conflicts, unusable
applications, and invalid adapters fail during assembly.

Future permission plugins must claim their corresponding exclusive stage during
setup. Their schema extension handlers remain independently validated by Core,
so Schema does not gain knowledge of CLP, ACL, or field-permission contracts.
