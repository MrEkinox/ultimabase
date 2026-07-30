# 726: Add health and readiness plugin

- Status: planned
- Milestone: 7+
- Packages: future health package
- Depends on: 208, 601
- ADR: none

## Goal

Expose lifecycle-aware liveness and dependency readiness without coupling Core to HTTP.

## Acceptance criteria

- [ ] HTTP exposure is optional.
- [ ] Sensitive dependency details are hidden.
