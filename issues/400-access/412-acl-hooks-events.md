# 412: Emit committed ACL change events

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`
- Depends on: 328, 332, 411, 509
- ADR: ADR-0015, ADR-0089, ADR-0090, ADR-0116, ADR-0122

## Goal

Observe the ACL field through the native hook lifecycle and emit one typed,
post-commit audit event without adding a parallel ACL hook API.

## Acceptance criteria

- [x] Events contain actor, target, mutation terminal, and structured diff.
- [x] Structured diffs report added and removed public, authenticated, principal, role, and right entries without exposing private internal collections.
- [x] Public realtime does not expose ACL changes by default.
- [x] Failed transactions emit no post-commit event.
- [x] The plugin appends one typed field-kind hook through the native dispatcher without replacing developer hooks or exposing `acl({ hooks })`.
- [x] The hook observes only authorized persisted ACL changes and does not implement ACL enforcement.
- [x] ACL enforcement remains an Access contribution and never becomes a replaceable operation transform.
- [x] Master changes remain audited even though ACL authorization is bypassed.
- [x] Default generation, explicit create input, update input, create-many, and reference cleanup have deterministic lifecycle coverage without duplicate events.
- [x] Opaque plugin-field equality uses its portable storage codec before producing semantic changes.

## Tests

- [x] Unit, type, public-export, ordering, rollback, and PostgreSQL cleanup tests.
