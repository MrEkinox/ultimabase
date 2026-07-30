# 705: Add file plugin and fileField

- Status: planned
- Milestone: 7+
- Packages: future files package
- Depends on: 103, 617
- ADR: new ADR required

## Goal

Provide storage-adapter-backed file metadata, upload authorization, and a typed field extension.

## Acceptance criteria

- [ ] Core and Schema do not know storage providers.
- [ ] Metadata and blob lifecycle are transaction-aware.
