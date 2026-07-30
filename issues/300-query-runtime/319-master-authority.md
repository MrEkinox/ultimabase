# 319: Implement trusted master authority

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/access`, `@ultimabase/runtime`
- Depends on: 310, 313, 318
- ADR: ADR-0013

## Goal

Allow trusted server code to execute master operations with a reason while preventing transport forgery.

## Acceptance criteria

- [ ] `useMasterKey` works only through trusted engine authority.
- [ ] Master usage emits an audit-ready event.
- [ ] Default bypass excludes validation, SQL constraints, transactions, business hooks, and tenant isolation.

## Tests

- [ ] Forged input and trusted server paths.
