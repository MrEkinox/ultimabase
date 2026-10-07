# 711: Add PostgreSQL outbox plugin

- Status: ready
- Milestone: 7+
- Packages: future `@ultimabase/postgres-outbox-plugin`
- Depends on: 318, 508
- ADR: new ADR required

## Goal

Persist post-commit event intent atomically with business transactions.

## Acceptance criteria

- [ ] At-least-once semantics are documented.
- [ ] Consumers are idempotency-friendly.
