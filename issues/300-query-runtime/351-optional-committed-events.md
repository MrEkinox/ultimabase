# 351: Support optional committed events without synthetic consumers

- Status: done
- Milestone: 3
- Packages: `@ultimabase/core`, `@ultimabase/acl-permissions-plugin`, `@ultimabase/roles-plugin`
- Depends on: 318, 332, 412
- ADR: ADR-0131

## Goal

Distinguish optional post-commit notifications from required event delivery so
feature plugins do not register no-op consumers merely to make ordinary writes
valid.

## Acceptance criteria

- [x] Event definitions explicitly select required or optional delivery semantics.
- [x] Emitting an optional event with no consumer succeeds and queues no useless post-commit work.
- [x] Required events still fail with a typed error when a consumer is missing, preserving typo and configuration diagnostics.
- [x] Both modes retain transaction-only emission, detached payloads, deterministic consumers, rollback discard, and recursion protection.
- [x] ACL and roles remove their internal no-op consumers and use the generic optional event contract.
- [x] Core does not identify ACL, roles, audit, realtime, or another event owner.
- [x] Existing `onEvent` consumers remain precisely typed and composition order remains deterministic.

## Tests

- [x] Runtime tests cover optional zero/one/multiple consumers, required missing consumers, commit, rollback, and handler failure.
- [x] ACL and role PostgreSQL tests prove writes succeed without observers and real observers still receive one event.
