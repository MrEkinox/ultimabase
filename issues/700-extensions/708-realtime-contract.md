# 708: Define realtime event contract

- Status: planned
- Milestone: 7+
- Packages: future realtime package
- Depends on: 318, 617
- ADR: new ADR required

## Goal

Define post-commit create, update, delete, enter, and leave events independently from GraphQL.

## Acceptance criteria

- [ ] Events contain safe before/after metadata.
- [ ] ACL and field permissions filter subscriptions.
