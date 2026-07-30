# 403: Implement direct role memberships

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 402, 317
- ADR: ADR-0006

## Goal

Add users and roles as members through transaction-safe services.

## Acceptance criteria

- [ ] Duplicate membership is idempotent or a typed conflict.
- [ ] Master is required by default.
- [ ] Membership changes emit audit-ready events.

## Tests

- [ ] Add, remove, duplicate, and rollback tests.
