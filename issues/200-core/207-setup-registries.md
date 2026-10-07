# 207: Add plugin setup registries

- Status: completed
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 203, 206, 113
- ADR: ADR-0048

## Goal

Expose scoped registries for services, extensions, operators, hooks, generators, transports, pipelines, events, and commands.

## Acceptance criteria

- [x] Registries are application-owned.
- [x] Contributions record their owning plugin.
- [x] Unsupported schema extensions can be detected after setup.

## Tests

- [x] Contributions from two applications do not leak.
