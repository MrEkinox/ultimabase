# ADR-0135: First-class Query range filters

- Status: accepted
- Date: 2026-08-05
- Extends: ADR-0052, ADR-0053, ADR-0083

## Context

Ordered scalar fields already support independent lower-bound and upper-bound
comparisons. Developers can combine those leaves manually, but that loses the
declared intent of one interval and gives transports, Access providers, and
adapters no single range operation to preserve.

UltimaBase's Query AST is the transport-neutral operation contract rather than
an encoding of one database syntax. An official range filter should therefore
remain distinguishable from an arbitrary logical combination.

## Decision

Query defines `between` and `not-between` primitive filter nodes. Each node
carries one ordered scalar field plus `lower` and `upper` bounds of the field's
exact non-null logical type.

Both bounds are inclusive for `between`. `not-between` is its direct inverse:
it matches values strictly below the lower bound or strictly above the upper
bound. Null never satisfies either operator and is not accepted as a bound.

The public immutable builders expose `between(field, lower, upper)` and
`notBetween(field, lower, upper)`. Query, schema-command predicates, native
Access filters, and relation predicates create the same nodes. The capability
matrix enables them for every existing ordered non-list field kind.

Core validates and snapshots each bound independently but does not compare the
bounds with JavaScript. Ordering and collation remain adapter semantics, so an
inverted interval is a valid predicate that normally matches no value for
`between` and every non-null value for `not-between`.

Adapters compile the explicit nodes without first rewriting them into logical
branches. PostgreSQL uses parameterized range predicates and never interpolates
developer values.

## Consequences

- Transports and plugins can preserve interval intent during normalization and
  inspection.
- Every ordered field receives the same range capability and exact bound type.
- Adapter visitors must handle both new discriminants exhaustively.
- Exclusive or half-open ranges remain expressible through the existing
  comparison operators and do not add range options.
