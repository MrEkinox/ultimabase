# 727: Add administration application

- Status: planned
- Milestone: 7+
- Packages: future admin application and SDK
- Depends on: 719, 721
- ADR: new ADR required

## Goal

Provide a separately deployed admin experience using public APIs and explicit master authority.

## Acceptance criteria

- [ ] The admin app never imports server internals.
- [ ] Every privileged action records a reason and audit event.
