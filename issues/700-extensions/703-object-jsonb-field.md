# 703: Add JSONB object fields

- Status: planned
- Milestone: 7+
- Packages: schema, postgres, transports
- Depends on: 617
- ADR: none

## Goal

Add nested typed object fields stored as JSONB with validation and selection semantics.

## Acceptance criteria

- [ ] Nested inference and validation are preserved.
- [ ] PostgreSQL storage is JSONB.
- [ ] Partial update behavior is explicit.
