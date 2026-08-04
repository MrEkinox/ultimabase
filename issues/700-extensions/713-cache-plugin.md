# 713: Add cache contracts and invalidation

- Status: planned
- Milestone: 7+
- Packages: future cache plugin packages ending with `-plugin`
- Depends on: 318, 617
- ADR: new ADR required

## Goal

Cache normalized query results without bypassing access rules or serving stale private data.

## Acceptance criteria

- [ ] Cache keys include relevant access context.
- [ ] Mutations invalidate after commit.
