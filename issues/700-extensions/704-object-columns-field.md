# 704: Add column-backed object fields

- Status: planned
- Milestone: 7+
- Packages: schema, postgres
- Depends on: 703
- ADR: new ADR required

## Goal

Compile nested object fields into prefixed physical columns while retaining one logical field.

## Acceptance criteria

- [ ] Column naming and collision rules are deterministic.
- [ ] Migration diffs understand nested paths.
