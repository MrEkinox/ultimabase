# 702: Add pointer fields and immutable Pointer values

- Status: completed
- Milestone: 7+
- Packages: `@ultimabase/core`
- Depends on: 701
- ADR: ADR-0005, ADR-0118

## Goal

Introduce the transport-neutral single-object relationship declaration and its
small immutable runtime identity value.

## Acceptance criteria

- [x] `pointerField({ target: () => TargetSchema })` infers the exact target schema through create, update, persisted, and selected model types.
- [x] `Pointer<TSchema>` is nominal, immutable, serializable through a stable Core-owned logical shape, and never auto-loads its target.
- [x] Developers can construct a pointer explicitly and through a typed schema convenience from a target identifier.
- [x] Pointer options document nullability, required input, uniqueness, and `restrict`, `cascade`, or `setNull` referential behavior; the default is `restrict`.
- [x] `list: true` is rejected because collections use `relationField`.
- [x] Pointer equality and snapshots compare logical schema identity plus target identifier without depending on a database or transport.

## Tests

- [x] Colocated runtime, type, IntelliSense, immutability, and packed-export tests cover all public declarations and values.

## Out of scope

- Query execution, target inclusion, physical foreign keys, to-many relations, and transports.
