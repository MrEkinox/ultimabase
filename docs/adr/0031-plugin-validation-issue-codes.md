# ADR-0031: Plugin validation issue codes

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0020, ADR-0029
- Refined by: ADR-0191, ADR-0193

## Decision

Framework validation failures retain the closed `ValidationIssueCode` union.
Field plugins define codes through
`PluginValidationIssueCode<TFieldKind>`, which prefixes the plugin-owned detail
with the already namespaced logical field kind. For example, the
`pg-vector.vector` field may report `pg-vector.vector.dimension`.

`ValidationIssue<TCode>` is generic. Its default remains the framework union so
existing consumers keep exhaustive built-in handling, while plugin registries
and validators can select their own namespaced code union explicitly.

## Consequences

Community fields can report stable machine-readable errors without modifying
Schema for every plugin. Plugin codes cannot collide accidentally when field
kind ownership is enforced during future application setup.

Transports continue to serialize one issue shape. Applications that combine
built-in and plugin failures may use `AnyValidationIssueCode` or a narrower
union of the installed plugins.
