# 721: Add durable audit plugin

- Status: planned
- Milestone: 7+
- Packages: future audit package
- Depends on: 318, 412, 617
- ADR: new ADR required

## Goal

Persist actor, reason, operation, object, ACL diff, and master-use events.

## Acceptance criteria

- [ ] Secret and sensitive field values are redacted.
- [ ] Audit delivery semantics are explicit.
