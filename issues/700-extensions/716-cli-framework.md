# 716: Implement CLI framework

- Status: planned
- Milestone: 7+
- Packages: future cli package
- Depends on: 207, 617, 808
- ADR: new ADR required

## Goal

Complete the general application CLI after issue 808 establishes the schema
generation, watch, and startup-regeneration foundation.

## Acceptance criteria

- [ ] CLI reuses issue 808 generation and application-loading behavior rather than defining a second command pipeline.
- [ ] Plugins register commands through Core contracts.
- [ ] General `dev`, `build`, and `doctor` behavior composes with generated schema contracts.
