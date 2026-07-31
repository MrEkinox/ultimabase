# ADR-0032: Object list update replacement

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0019, ADR-0021

## Decision

Updating a scalar object field is a deep patch: declared child fields are
optional, generated or immutable children remain forbidden, and omitted
children retain their stored values.

Updating a field whose complete value is a list replaces that list. When its
items are objects, every replacement item therefore uses create-input
semantics. Required children must be present, defaulted children may be omitted,
and generated children remain forbidden. The rule applies at every supported
list depth because the scalar item plan is shared by all list wrappers.

## Consequences

Runtime does not need ambiguous index-based merge rules for list elements.
Static inference and compiled validation plans describe the same replacement
contract.

Future atomic list mutation operators may define separate operation AST nodes;
they must not silently change the meaning of a regular field update.
