# 741: Add owning and inverse relation fields

- Status: planned
- Milestone: 7+
- Packages: `@ultimabase/core`
- Depends on: 701, 702, 740
- ADR: ADR-0118

## Goal

Declare queryable to-many relationships with explicit ownership and inverse
mapping while keeping collections out of ordinary model values.

## Acceptance criteria

- [ ] `relationField({ target: () => TargetSchema })` declares one owning to-many relationship with exact target inference.
- [ ] `mappedBy` declares an inverse relationship against one exact compatible pointer or relation field and creates no second storage owner.
- [ ] One-to-many uses an inverse pointer; many-to-many uses one owning relation and an optional inverse; one-to-one remains a unique pointer.
- [ ] Application setup rejects missing, ambiguous, incompatible, self-conflicting, or multiply owned mappings with exact schema and field paths.
- [ ] Relation fields never accept `list`, scalar defaults, or embedded collection values and are omitted from base create, update, and `InferObject` records.
- [ ] Logical relation metadata contains no join-table, SQL, REST, or GraphQL naming.

## Tests

- [ ] Colocated runtime, type, IntelliSense, circular-target, validation, and packed-export tests cover every supported topology.

## Out of scope

- Relation handles, persistence, predicates, physical join tables, and transports.
