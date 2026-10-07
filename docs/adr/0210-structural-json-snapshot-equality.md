# ADR-0210: Adapter snapshots use structural JSON equality

- Status: accepted
- Date: 2026-08-21
- Refines: ADR-0188, ADR-0193

## Context

Core persists adapter contribution payloads and normalized static options as
validated immutable JSON snapshots. Migration planning must distinguish an
unchanged physical contribution from one that requires an explicit upgrade.

The first implementation compared those snapshots with `JSON.stringify`.
Object property order is not part of the JSON data model, but serialization
preserves insertion order. Reconstructing the same snapshot with another
property order could therefore manufacture an upgrade requirement. Arrays, by
contrast, are ordered values and must remain order-sensitive.

Core already owns the snapshot boundary. Moving general equality into
`@ultimabase/shared` would make every package inherit a dependency for one
current Core use, while reusing the broader schema-declaration compatibility
comparator would couple adapter migration behavior to non-JSON declaration
semantics.

## Decision

Migration planning compares validated `JsonValue` snapshots through one
internal `equalJsonValues` helper backed by `fast-equals`. Object property order
is irrelevant recursively. Array order and primitive values remain
significant; positive and negative zero are the same portable JSON number.

The helper accepts only `JsonValue`, is not publicly exported, and keeps the
third-party function behind a Core-owned semantic boundary. `fast-equals` is a
direct Core production dependency rather than a Shared dependency.

Contribution identity keys continue to use deterministic tuple serialization.
Typegen output and Runtime comparisons over richer JavaScript values do not use
this helper.

## Consequences

- Equivalent persisted metadata no longer requires an upgrade because of key order.
- Migration comparison avoids maintaining a recursive equality implementation.
- Core gains one small implementation dependency with no effect on its product or infrastructure boundaries.
- Future non-JSON equality needs do not automatically reuse this contract.
