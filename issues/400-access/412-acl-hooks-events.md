# 412: Add ACL hooks and events

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions`
- Depends on: 328, 332, 411
- ADR: ADR-0015, ADR-0089

## Goal

Emit before/after ACL update hooks and post-commit audit events.

## Acceptance criteria

- [ ] Events contain actor, target, and structured diff.
- [ ] Public realtime does not expose ACL changes by default.
- [ ] Failed transactions emit no post-commit event.
- [ ] The plugin appends typed extension- or schema-targeted hooks through the native dispatcher without replacing developer hooks.
- [ ] ACL enforcement remains in its reserved security stage rather than an ordinary business hook.

## Tests

- [ ] Ordering and rollback tests.
