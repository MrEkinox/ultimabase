# 702: Add relation fields

- Status: planned
- Milestone: 7+
- Packages: schema, query, postgres, transports
- Depends on: 701
- ADR: new ADR required

## Goal

Add typed many-to-many relations with deterministic join tables and cursor pagination.

## Acceptance criteria

- [ ] Join-table ownership and naming are deterministic.
- [ ] Relation operations use Runtime and transactions.
- [ ] ACL filters related objects in SQL.
