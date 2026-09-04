# 616: Add GraphiQL and Apollo Sandbox plugins

- Status: planned
- Milestone: 6
- Packages: future explorer packages
- Depends on: 205, 615
- ADR: ADR-0003, ADR-0010

## Goal

Provide separate `graphiqlPlugin` and `apolloSandboxPlugin` implementations.

## Acceptance criteria

- [ ] Each plugin nests under GraphQL Yoga.
- [ ] Explorers are disabled in production unless explicitly enabled.
- [ ] There is no generic provider-switch explorer plugin.

## Tests

- [ ] Development/production and nesting fixtures.
