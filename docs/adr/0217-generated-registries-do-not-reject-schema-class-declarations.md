# ADR-0217: Generated registries do not reject schema class declarations

- Status: superseded
- Superseded by: ADR-0297 (Typegen removed in migration step 6.8b, 2026-10-13)
- Date: 2026-08-21
- Refines: ADR-0175
- Depends on: ADR-0173, ADR-0175

## Context

Static TypeScript schema declarations are Runtime truth, while the generated
registry is a replaceable declaration artifact regenerated automatically by
`typegenPlugin()` during application startup. ADR-0175 nevertheless made a
loaded registry reject a `Schema.define()` class name that was not present in
the previous artifact.

That rule reports every newly authored schema as invalid between its declaration
and the next startup. It also cannot establish general artifact freshness: a
schema whose fields changed while its class name stayed stable still satisfies
the check. The artificial diagnostic therefore adds editor noise without
providing a reliable freshness guarantee.

## Decision

`Schema.define()` accepts every string class name regardless of the currently
loaded generated registry. Runtime normalization retains the existing non-empty
name validation. A name already present in the registry continues to resolve
its exact generated schema contract. A new name uses Core's bootstrap schema
contract until the next startup generation replaces the artifact.

Core removes the `RequireGeneratedSchemaEntry` public type and its artificial
missing-or-stale diagnostics. Ordinary TypeScript structural checks still report
a missing `className` property.

This decision is deliberately limited to the schema's own `className`.
Generated target-name constraints for pointer and relation declarations remain
unchanged.

Artifact freshness belongs to automatic startup generation and any future
fingerprint-based check command. TypeScript declaration inference does not
pretend to validate it from class-name membership.

## Consequences

- Developers can add a schema after generation without receiving a false editor
  error.
- Newly declared schemas temporarily expose documented bootstrap types until
  `typegenPlugin()` runs again.
- Existing generated schemas retain their exact models and operation inputs.
- Removing or renaming a schema no longer produces a custom `Schema.define()`
  diagnostic before startup; the next generation replaces the old registry.
- Pointer and relation target authoring retains its current generated-name
  behavior for a separate decision.
