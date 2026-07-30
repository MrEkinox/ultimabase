# 706: Define authentication plugin contract

- Status: planned
- Milestone: 7+
- Packages: core, runtime, access
- Depends on: 617
- ADR: new ADR required

## Goal

Normalize transport credentials into user auth context without coupling Core to a provider.

## Acceptance criteria

- [ ] Authentication and authorization remain distinct.
- [ ] Session secrets never enter request metadata.
