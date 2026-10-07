# ADR-0088: Compact field inference state

- Status: accepted
- Date: 2026-08-01
- Extends: ADR-0014, ADR-0019, ADR-0021, ADR-0037
- Supersedes: ADR-0019 field-extension inference only

## Context

Field factories currently preserve every declared option literal in their
returned `FieldDefinition`. This keeps runtime metadata exact, but editor
QuickInfo repeats validation ranges, defaults, indexes, and other values that
do not change operation input or output types.

## Decision

`FieldDefinition` carries a separate type-only inference state alongside its
runtime options. The state records property presence for create, object, and
update modes, complete-value nullability, and list depth.

Factories calculate effective operation presence before returning a field. A
default therefore makes create input optional and persisted output required
without preserving the default's literal value. Immutable fields are forbidden
from update input, while list tuples retain their exact dimensions.

Runtime options remain immutable and complete. Validation constraints,
descriptions, indexes, and default values are widened to their documented
option contracts when they do not affect static inference. Validation plans
and adapters continue reading those values from `field.options`.

Field extensions remain opaque runtime metadata and never modify schema
inference. A plugin that introduces a distinct logical value must define its
own plugin field so the field factory owns its TypeScript value contract. This
supersedes only the field-extension inference mechanism accepted by ADR-0019;
its operation-specific schema shapes remain unchanged.

Every built-in field factory returns this compact state. Scalar fields share
one runtime implementation, while concise field-specific aliases keep shared
implementation types out of editor hovers. `enumField` retains its exact value
domain and `objectField` retains its exact child map because both structures
directly determine inferred JavaScript values. Automatic integer sequences and
operation-clock dates retain only one additional generated-value boolean.

## Consequences

Built-in declarations retain the same autocomplete, option documentation,
runtime validation, immutability, plugin extensions, and inferred create,
object, and update shapes. Hover signatures no longer repeat validation
constraints, indexes, literal defaults, descriptions, or shared field
internals.

Code inspecting a returned field sees its documented field-options interface
rather than the exact caller object. Consumers must narrow optional runtime
metadata before reading it, which matches how adapters already handle schema
options. Default presence is represented only by a boolean type parameter; the
declared default value is never retained as a literal type.

Plugin-defined fields keep ownership of their own public type facade. They may
retain additional structural type information only when it changes their
logical JavaScript value or operation-specific inference.
