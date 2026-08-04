# 424: Add versioned ACL JSON serialization

- Status: planned
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

- [ ] `toJSON()` returns a named readonly `ACLJSON` document with version, public rights, authenticated rights, principal entries, and role entries.
- [ ] Principal entries retain schema class name plus object ID; role entries retain their complete stable schema-qualified neutral identity.
- [ ] Any number of principal and role entries round-trip without loss.
- [ ] Equivalent ACL values serialize canonically regardless of grant call order.
- [ ] The returned document is detached from ACL internals and cannot mutate the source value.
- [ ] `ACL.fromJSON(value: unknown)` validates the complete boundary and rejects unknown versions, keys, subjects, rights, malformed IDs, and invalid combinations.
- [ ] Duplicate entries and rights follow one documented canonical normalization rule rather than creating ambiguous state.
- [ ] `JSON.stringify(acl)` delegates naturally to `toJSON()`.
- [ ] Serialization and parsing perform no schema lookup, subject resolution, or database I/O.

## Tests

- [ ] Round-trip, canonical-order, detached-value, malformed-input, unknown-version, duplicate, and public packed-export tests.
- [ ] Type and language-service tests keep `ACLJSON`, `toJSON()`, and `fromJSON()` readable without exposing internal maps.
