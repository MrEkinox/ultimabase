# 604: Create REST request contexts

- Status: planned
- Milestone: 6
- Packages: `@ultimabase/rest-plugin`
- Depends on: 314, 350, 601
- ADR: ADR-0113

## Goal

Create an anonymous request scope from transport-safe request data, then let
installed plugins validate their own credentials and derive typed context
values before execution.

## Acceptance criteria

- [ ] REST creates an anonymous Core context without requiring authentication.
- [ ] Ordered plugin context resolvers may derive typed values but cannot broaden authority.
- [ ] Raw master keys and client-provided master flags never enable master transport execution.
- [ ] Authentication headers remain private to the installed authentication plugin and never enter request metadata.
- [ ] AsyncLocalStorage covers the full handler.

## Tests

- [ ] Anonymous, plugin-derived identity, malformed plugin credentials, and forged master requests.
