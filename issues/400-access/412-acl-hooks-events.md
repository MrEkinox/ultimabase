# 412: Add ACL hooks and events

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`
- Depends on: 328, 332, 411, 509
- ADR: ADR-0015, ADR-0089, ADR-0090, ADR-0116, ADR-0122

## Goal

Emit before/after ACL update hooks and post-commit audit events.

## Acceptance criteria

- [ ] Events contain actor, target, and structured diff.
- [ ] Structured diffs report added and removed public, authenticated, principal, role, and right entries without exposing private internal collections.
- [ ] Public realtime does not expose ACL changes by default.
- [ ] Failed transactions emit no post-commit event.
- [ ] The plugin appends typed extension- or schema-targeted hooks through the native dispatcher without replacing developer hooks.
- [ ] Hooks observe only ACL lifecycle events after the native Access plan has authorized their input; they do not implement ACL enforcement.
- [ ] ACL enforcement remains an Access contribution and never becomes a replaceable operation transform.
- [ ] Master changes remain audited even though ACL authorization is bypassed.
- [ ] Default generation, explicit create input, update input, and reference cleanup have deterministic lifecycle coverage without duplicate events.

## Tests

- [ ] Ordering and rollback tests.
