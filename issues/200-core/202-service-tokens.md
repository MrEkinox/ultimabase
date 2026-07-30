# 202: Implement typed service tokens

- Status: planned
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 201
- ADR: ADR-0001

## Goal

Replace untyped string service lookup with nominal typed tokens.

## Acceptance criteria

- [ ] Tokens preserve service type inference.
- [ ] Debug names do not determine token identity.
- [ ] Duplicate provision policy is explicit.

## Tests

- [ ] Type tests reject mismatched services.
