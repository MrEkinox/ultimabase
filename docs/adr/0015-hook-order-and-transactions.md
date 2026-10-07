# ADR-0015: Hook order and transaction boundary

- Status: accepted
- Date: 2026-07-30

## Decision

Hooks follow the documented Runtime pipeline. Ordering uses plugin dependencies then configuration position. Business after-hooks run before commit; external events run after commit.

## Consequences

Business hooks can abort a transaction. Realtime and asynchronous consumers never observe uncommitted changes.
