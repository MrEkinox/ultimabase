# 704: Add column-backed object fields

- Status: ready
- Milestone: 7+
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 703
- ADR: ADR-0021, ADR-0165, new ADR required

## Goal

Compile nested object fields into prefixed physical columns while retaining one logical field.

This is an explicit PostgreSQL-specific alternative to the default JSONB
storage; it must not alter the portable `objectField` schema contract.

## Acceptance criteria

- [ ] Column naming and collision rules are deterministic.
- [ ] Migration diffs understand nested paths.
