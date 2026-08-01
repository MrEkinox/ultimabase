# 502: Add internal Drizzle adapter

- Status: ready
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 501
- ADR: ADR-0007

## Goal

Wrap Drizzle around the `pg` pool without exposing Drizzle publicly.

## Acceptance criteria

- [ ] Drizzle imports remain inside the package.
- [ ] Public exports contain no Drizzle types.
- [ ] Existing and transactional clients satisfy internal contracts.

## Tests

- [ ] Public declaration inspection and query smoke test.
