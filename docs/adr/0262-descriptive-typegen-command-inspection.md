# ADR-0262: Descriptive Typegen command inspection

- Status: accepted
- Date: 2026-09-20
- Refines: ADR-0259 and ADR-0261
- Implementation: issue 3011

## Context and approval

The public `CompiledTypegenGraph` exposes original operation tokens containing
input/result snapshot callbacks and schema constructors. Its current Typegen
and testing consumers only read descriptive facts. Retaining those executable
objects conflicts with the accepted callback-free projection target, but their
removal changes an exported tooling contract beyond ADR-0259's ten removals.

The user explicitly approved this additional, targeted removal after the
consumer audit and architecture stop. An unused option may be added later when
a concrete requirement justifies it; speculative compatibility is unnecessary.

## Decision

Keep `CompiledTypegenGraph`, `FrameworkApplication.typegenGraph`, and
`PluginSetupContext.typegenGraph` with their current property organization.
Operation entries derive canonical facts without input/result snapshot callbacks
or nominal executable-token identity. Schema surface entries expose only
`schema: { className }` instead of the schema constructor. Retain owners, consumed
nominal type references, mutation contracts, static options and ordering.

One compiled surface index supplies direct execution and descriptive inspection.
Detached inspection Maps never mutate execution state. No second registration
store, public graph API, compatibility accessor or capability is added.

Original operation declarations, direct class/application/model methods, Runtime
snapshot validation, Typegen outputs and fingerprints retain their behavior.
This decision narrows only tooling inspection. It does not remove schema
constructors or validators from their existing authoring and execution APIs.

## Validation and documentation

Protect callback/constructor absence, canonical fact identity, alias order and
detached indexes. Test the narrowed type against source and built package
exports, retain existing editor/JavaScript behavior, and compare generated
declarations and fingerprints. Update Core/Typegen READMEs, the public plugin
authoring website and the root removal history in issue 3011.
