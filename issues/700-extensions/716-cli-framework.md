# 716: Implement CLI framework

- Status: planned
- Milestone: 7+
- Packages: future cli package
- Depends on: 207, 617
- ADR: new ADR required

## Goal

Provide `dev`, `generate`, `build`, `start`, and `doctor` plus plugin-contributed commands.

## Acceptance criteria

- [ ] CLI loads application configuration safely.
- [ ] Plugins register commands through Core contracts.
