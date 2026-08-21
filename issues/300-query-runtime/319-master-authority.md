# 319: Implement trusted master authority

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/access`, `@ultimabase/runtime`
- Depends on: 310, 313, 318
- ADR: ADR-0013, ADR-0071

## Goal

Allow trusted server code to execute master operations with a reason while preventing transport forgery.

## Acceptance criteria

- [x] `useMasterKey` works only through trusted engine authority.
- [x] Master usage emits an audit-ready event.
- [x] Default bypass excludes validation, SQL constraints, transactions, business hooks, and tenant isolation.

## Tests

- [x] Forged input and trusted server paths.
