# 703: Compile object fields to JSONB

- Status: planned
- Milestone: 7+
- Packages: schema, postgres, transports
- Depends on: 617
- ADR: ADR-0017

## Goal

Compile the structured object fields introduced by issue 108 to PostgreSQL JSONB
with validation and selection semantics.

## Acceptance criteria

- [ ] Nested inference and validation are preserved.
- [ ] PostgreSQL storage is JSONB by default.
- [ ] Nested Date values round-trip through the adapter codec.
- [ ] Nested indexes compile explicitly or fail setup.
- [ ] Partial update behavior is explicit.
