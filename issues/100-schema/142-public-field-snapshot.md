# 142: Expose the field snapshot boundary

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 131, 140
- ADR: ADR-0041

## Goal

Let Runtime normalize and detach values through the capability already owned by
each declared field without deep imports or duplicated field logic.

## Acceptance criteria

- [x] Schema exports `snapshotScalarFieldValue(field, value, path)`.
- [x] The return type follows the exact logical scalar before list metadata.
- [x] Built-in, binary, and plugin fields reuse their registered scalar snapshot
      capability.
- [x] Structurally forged fields remain rejected.
- [x] The function does not read or execute field defaults.
- [x] Runtime documentation uses the public boundary at structural-plan leaves.

## Tests

- [x] Runtime tests cover detached mutable values and forged fields.
- [x] Compile-time tests cover exact returned field values.
- [x] Public export and packaged archive tests include the new function.
