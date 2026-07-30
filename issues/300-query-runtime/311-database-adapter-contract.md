# 311: Define database adapter contract

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`
- Depends on: 307, 310, 202
- ADR: ADR-0004, ADR-0007

## Goal

Define operation and transaction execution without SQL or Drizzle types.

## Acceptance criteria

- [ ] Adapter receives normalized AST and access constraints.
- [ ] Transaction adapters are distinguishable.
- [ ] Results preserve operation semantics.

## Tests

- [ ] In-memory fake proves the contract without becoming a production adapter.
