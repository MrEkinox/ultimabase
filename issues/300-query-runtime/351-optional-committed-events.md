# 351: Support optional committed events without synthetic consumers

- Status: ready
- Milestone: 3
- Packages: `@ultimabase/core`, `@ultimabase/acl-permissions-plugin`, `@ultimabase/roles-plugin`
- Depends on: 318, 332, 412
- ADR: new ADR required

## Goal

Distinguish optional post-commit notifications from required event delivery so
feature plugins do not register no-op consumers merely to make ordinary writes
valid.

## Acceptance criteria

- [ ] Event definitions explicitly select required or optional delivery semantics.
- [ ] Emitting an optional event with no consumer succeeds and queues no useless post-commit work.
- [ ] Required events still fail with a typed error when a consumer is missing, preserving typo and configuration diagnostics.
- [ ] Both modes retain transaction-only emission, detached payloads, deterministic consumers, rollback discard, and recursion protection.
- [ ] ACL and roles remove their internal no-op consumers and use the generic optional event contract.
- [ ] Core does not identify ACL, roles, audit, realtime, or another event owner.
- [ ] Existing `onEvent` consumers remain precisely typed and composition order remains deterministic.

## Tests

- [ ] Runtime tests cover optional zero/one/multiple consumers, required missing consumers, commit, rollback, and handler failure.
- [ ] ACL and role PostgreSQL tests prove writes succeed without observers and real observers still receive one event.
