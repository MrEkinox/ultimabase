# ADR-0170: Read and write field Access

- Status: accepted
- Date: 2026-08-08
- Refines: ADR-0116, ADR-0169
- Refined by: ADR-0171, ADR-0194

## Context

Schema Access authorizes operations, but field Access protects a different
boundary: whether one value may be disclosed, supplied, replaced, or cleared.
Mirroring schema `create` and `update` at the field root obscured the difference
between providing a value during object creation and filling an empty field in
a later update. Update callbacks also forced every developer to rediscover
`null` transition semantics manually.

Field filtering and ordering are indirect disclosure capabilities. Their old
`filter` and `order` names no longer matched the canonical public Query options
`where` and `orderBy`.

## Decision

Generic field Access has two root capabilities: `read` and `write`.

`read` accepts a concise boolean applying to output, where predicates, and
ordering, or the complete `{ output, where, orderBy }` form. Only the output
rule receives a value because predicate and ordering authorization happens
before any row value exists.

`write` accepts a concise boolean applying to every write, or the complete
`{ create, update }` form. Detailed `update` accepts a concise boolean or the
complete `{ fill, replace, clear }` transition map:

- `create` protects a supplied field on the actual create branch;
- `fill` protects `null` to non-null updates;
- `replace` protects non-null to non-null updates, including repeated values;
- `clear` protects every update ending in canonical `null`.

Transition selection uses the final candidate after update operators. Direct
`null` and `unset()` are therefore indistinguishable. Upserts evaluate only the
branch selected after target resolution, before its write executes.

Relation fields retain their handle-specific behavior. They expose `read` and
`write`, while `write` receives the typed relation change because connect,
disconnect, set, and clear are not embedded scalar transitions.

The application compiler keeps rules private, ordered, and monotonic. This
change refines the field portion of the plan without changing schema Access,
master behavior, transactions, or business-hook ordering.

## Consequences

- Field declarations match the questions developers answer in application
  policy: may this value leave, be initially supplied, be filled, be replaced,
  or be cleared?
- Concise booleans keep common declarations short while complete detailed forms
  prevent a missing transition from inheriting a broader fallback.
- Field transition callbacks receive only values meaningful to their branch.
- Evaluating actual upsert branches removes policy checks against unused input.
- The pre-release API intentionally rejects the previous field declaration
  shape.
