# 412: Add ACL hooks and events

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 328, 332, 411
- ADR: ADR-0015, ADR-0089, ADR-0090

## Goal

Emit before/after ACL update hooks and post-commit audit events.

## Acceptance criteria

- [ ] Events contain actor, target, and structured diff.
- [ ] Public realtime does not expose ACL changes by default.
- [ ] Failed transactions emit no post-commit event.
- [ ] The plugin appends typed extension- or schema-targeted hooks through the native dispatcher without replacing developer hooks.
- [ ] ACL enforcement uses monotonic guard, constraint, and restriction effects rather than replaceable operation transforms.

## Tests

- [ ] Ordering and rollback tests.
