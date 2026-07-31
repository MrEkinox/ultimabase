# 202: Implement typed service tokens

- Status: done
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 201
- ADR: ADR-0043

## Goal

Replace untyped string service lookup with nominal typed tokens.

## Acceptance criteria

- [x] Tokens preserve service type inference.
- [x] Debug names do not determine token identity.
- [x] Duplicate provision policy is explicit.

## Tests

- [x] Type tests reject mismatched services.
