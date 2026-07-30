# 310: Define request context and access modes

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/access`, `@ultimabase/runtime`
- Depends on: 201
- ADR: ADR-0013

## Goal

Represent request source, authentication, anonymous/user/master access, capabilities, request ID, and metadata.

## Acceptance criteria

- [ ] There is no system access mode.
- [ ] Raw master keys never enter context.
- [ ] Context values are readonly.

## Tests

- [ ] Type tests prevent invalid mode construction.
