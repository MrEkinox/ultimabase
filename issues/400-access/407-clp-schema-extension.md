# 407: Implement clpPermissions schema extension

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/clp-permissions`
- Depends on: 103, 401, 417, 419, 420
- ADR: ADR-0002, ADR-0006, ADR-0116

## Goal

Configure CLP operation policies as a typed provider-specific layer over native
Access declarations.

## Acceptance criteria

- [ ] Read, create, update, upsert, and delete families are configurable without separate `one` and `many` properties.
- [ ] Rules may be direct or synchronous per-operation functions.
- [ ] The exact terminal kind remains available to a callback when required.
- [ ] Anonymous, authenticated-principal, user, and role concepts remain CLP-domain rules resolved through issue 420 capabilities.
- [ ] The extension contains configuration only and cannot register hooks or execute access decisions.

## Tests

- [ ] Type tests for context-aware rule functions.
