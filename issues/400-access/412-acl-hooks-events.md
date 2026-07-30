# 412: Add ACL hooks and events

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 318, 411
- ADR: ADR-0015

## Goal

Emit before/after ACL update hooks and post-commit audit events.

## Acceptance criteria

- [ ] Events contain actor, target, and structured diff.
- [ ] Public realtime does not expose ACL changes by default.
- [ ] Failed transactions emit no post-commit event.

## Tests

- [ ] Ordering and rollback tests.
