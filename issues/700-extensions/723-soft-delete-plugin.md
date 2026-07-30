# 723: Add soft-delete plugin

- Status: planned
- Milestone: 7+
- Packages: future soft-delete package
- Depends on: 617
- ADR: new ADR required

## Goal

Contribute schema metadata and Runtime filters for recoverable deletion.

## Acceptance criteria

- [ ] Default reads exclude deleted rows.
- [ ] Master restore remains explicit and audited.
