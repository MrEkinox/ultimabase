# ADR-0019: Operation-specific schema inference

- Status: accepted
- Date: 2026-07-30

## Decision

Schema derives three distinct public shapes from one definition:

- `InferObject` represents immutable persisted output;
- `InferCreateInput` represents developer-supplied creation values;
- `InferUpdateInput` represents developer-supplied changes.

Persisted output requires fields declared as required and fields guaranteed by
defaults, auto-increment, or server generation. Create input omits generated
fields and makes defaulted or auto-incremented values optional. Update input
omits generated and immutable fields and makes all remaining values optional.
Nullability changes value domains independently from property presence.

Objects and arrays apply the active operation mode recursively. Field plugins
may expose a type-only `FieldInferenceExtension` contract with independent
output, create, and update overrides. `never` omits the field for one mode, and
exact extension tuples compose from first to last.

## Consequences

Runtime, adapters, transports, and generated SDKs can share operation shapes
without duplicating schema rules or checking reserved field names.

Plugins can model codecs, redaction, and other value transformations without
Schema interpreting their runtime configuration. Consumers that widen an
extension list to a general array intentionally lose ordered override
composition and retain the field's neutral base type.
