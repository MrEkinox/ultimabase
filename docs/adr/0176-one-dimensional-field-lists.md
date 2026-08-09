# ADR-0176: One-dimensional field lists and generated array filters

- Status: accepted
- Date: 2026-08-10
- Supersedes: ADR-0021 nested list-depth declarations
- Refines: ADR-0088, ADR-0173

## Context

ADR-0021 allowed `list` to be either a boolean or a tuple of `true` values so a
field could describe arbitrarily nested arrays. That increased the complexity
of every field value, validation plan, generated contract, adapter codec, and
filter without giving each dimension a distinct schema meaning. It also made a
typed list field overlap with `jsonField()`, which already owns intentionally
unstructured nested arrays.

Generated application contracts now make the exact public filter surface
visible. Emitting one generic nullable filter for lists loses useful element
operations, while parameterizing a public filter by every field value recreates
the generic type expansion that code generation is intended to remove.

## Decision

The common `list` option is boolean. `list: true` wraps one storable scalar,
enum, plugin, or object value in exactly one homogeneous list. `list: false`
keeps the ordinary value explicitly. Tuples and nested list-depth declarations
are rejected both statically and at runtime.

List elements are non-null. Field nullability applies to the complete list, so
an optional list is `readonly T[] | null`. Developers represent
multidimensional or heterogeneous arrays with `jsonField()` and its structural
or JSONPath filters.

The portable Query AST supports these one-dimensional list predicates:

- `eq` and `ne` compare the complete list;
- `has` tests one exact element;
- `hasSome` and `hasEvery` test candidate element collections;
- `isEmpty: true` tests a non-null empty list;
- `isNull` and `isNotNull` test complete-value nullability.

Code generation emits concrete element-aware names such as
`ArrayStringFilter`, `ArrayIntFilter`, and schema-specific enum or object array
filters. Generated where inputs reference those names directly; they do not
expose Core generic filter helpers.

PostgreSQL continues storing field lists as JSONB. Its compiler maps the
portable operations to parameterized JSONB equality and exact element
predicates after running every operand through the field storage codec. It does
not use structural containment as a substitute for typed object equality.

## Consequences

- A field declaration has one simple list switch and one predictable value
  shape.
- Validation, Access, hooks, generated contracts, and adapters only need one
  field-list wrapper.
- Typed list filters expose element operations with compact generated
  declarations and accurate autocomplete.
- JSON is the explicit escape hatch for nested arrays and intentionally gives
  up per-dimension field typing.
- Existing pre-release declarations using list tuples must move to a
  one-dimensional field or `jsonField()`; no compatibility layer is retained.
