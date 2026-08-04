# 424: Add versioned ACL JSON serialization

- Status: done
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`
- Depends on: 409
- ADR: ADR-0122

## Goal

Give immutable ACL values one stable, detached, versioned JSON representation
for transports, snapshots, persistence boundaries, and developer inspection.

## Target developer experience

```ts
const document = acl.toJSON()
const serialized = JSON.stringify(acl)
const restored = ACL.fromJSON(document)
```

## Acceptance criteria

- [x] `toJSON()` returns a named readonly `ACLJSON` document with version, public rights, authenticated rights, principal entries, and role entries.
- [x] Principal entries retain schema class name plus object ID; role entries retain their complete stable schema-qualified neutral identity.
- [x] Any number of principal and role entries round-trip without loss.
- [x] Equivalent ACL values serialize canonically regardless of grant call order.
- [x] The returned document is detached from ACL internals and cannot mutate the source value.
- [x] `ACL.fromJSON(value: unknown)` validates the complete boundary and rejects unknown versions, keys, subjects, rights, malformed IDs, and invalid combinations.
- [x] Duplicate entries and rights are combined by union, then emitted once in canonical order.
- [x] `JSON.stringify(acl)` delegates naturally to `toJSON()`.
- [x] Serialization and parsing perform no schema lookup, subject resolution, or database I/O.

## Tests

- [x] Round-trip, canonical-order, detached-value, malformed-input, unknown-version, duplicate, and public packed-export tests.
- [x] Type and language-service tests keep `ACLJSON`, `toJSON()`, and `fromJSON()` readable without exposing internal maps.
