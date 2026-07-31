# 311: Define database adapter contract

- Status: done
- Milestone: 3
- Packages: `@ultimabase/runtime`
- Depends on: 307, 310, 202
- ADR: ADR-0004, ADR-0007, ADR-0063

## Goal

Define operation and transaction execution without SQL or Drizzle types.

## Acceptance criteria

- [x] Adapter receives normalized AST and access constraints.
- [x] Transaction adapters are distinguishable.
- [x] Results preserve operation semantics.

## Tests

- [x] In-memory fake proves the contract without becoming a production adapter.
