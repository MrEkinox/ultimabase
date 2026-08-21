# 140: Reference fields in validation plans

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`, `@ultimabase/pg-vector-plugin`
- Depends on: 125, 129, 134, 139
- ADR: ADR-0039

## Goal

Keep operation-specific validation structure without maintaining a second
scalar metadata model beside declared fields.

## Acceptance criteria

- [x] Scalar plans retain their immutable declared field by identity.
- [x] Built-in and plugin-defined scalars share one structural plan contract.
- [x] Object and list plans compile only operation-specific child structure.
- [x] Constraints and defaults remain available exclusively through the field.
- [x] Compilation freezes final plan nodes without freezing throwaway bases.
- [x] Runtime, plugin, and public documentation describe the lean contract.

## Tests

- [x] Runtime tests cover scalar identity, presence, nesting, list replacement,
      plugin fields, and frozen plan containers.
- [x] Compile-time tests cover structural narrowing and exact plugin field
      generics.
