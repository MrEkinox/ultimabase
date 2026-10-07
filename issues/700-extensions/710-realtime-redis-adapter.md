# 710: Add Redis realtime adapter

- Status: planned
- Milestone: 7+
- Packages: future `@ultimabase/realtime-redis-plugin`
- Depends on: 708
- ADR: new ADR required

## Goal

Distribute normalized realtime events between application instances through Redis.

## Acceptance criteria

- [ ] Reconnect and duplicate-delivery semantics are explicit.
- [ ] Payloads are versioned.
