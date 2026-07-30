# 717: Add PostgreSQL migration CLI commands

- Status: planned
- Milestone: 7+
- Packages: postgres-migrations, cli
- Depends on: 515, 716
- ADR: ADR-0008

## Goal

Expose generate, apply, status, and explicit repair commands.

## Acceptance criteria

- [ ] Destructive actions require explicit flags.
- [ ] Generation can run without database mutation.
