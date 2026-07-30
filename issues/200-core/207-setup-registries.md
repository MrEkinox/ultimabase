# 207: Add plugin setup registries

- Status: planned
- Milestone: 2
- Packages: `@ultimabase/core`
- Depends on: 203, 206, 113
- ADR: ADR-0003

## Goal

Expose scoped registries for services, extensions, operators, hooks, generators, transports, pipelines, events, and commands.

## Acceptance criteria

- [ ] Registries are application-owned.
- [ ] Contributions record their owning plugin.
- [ ] Unsupported schema extensions can be detected after setup.

## Tests

- [ ] Contributions from two applications do not leak.
